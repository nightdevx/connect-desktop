// Windows WASAPI process-loopback capture that EXCLUDES the current process
// tree. This captures everything the system plays EXCEPT this app's own output,
// which is exactly what we need for screen-share system audio: remote
// participants' voices (played by Connect) are never captured, so nobody hears
// themselves echoed back.
//
// Pattern follows Microsoft's ApplicationLoopback sample
// (https://github.com/microsoft/Windows-classic-samples) adapted to push PCM to
// a Node ThreadSafeFunction instead of writing a WAV file.
//
// Output format is fixed to 48 kHz / 2 ch / 32-bit float interleaved so the
// renderer side doesn't have to negotiate; WASAPI resamples internally.
//
// Build: node-gyp (see binding.gyp). Must be rebuilt against Electron's ABI
// (electron-rebuild) before packaging. Windows 10 2004+ required.

#include <napi.h>

#ifdef _WIN32

#include <windows.h>
#include <mmdeviceapi.h>
#include <audioclient.h>
#include <audioclientactivationparams.h>
#include <wrl/implements.h>
#include <atomic>
#include <thread>
#include <vector>
#include <mutex>

using namespace Microsoft::WRL;

namespace {

constexpr DWORD kSampleRate = 48000;
constexpr WORD kChannels = 2;
constexpr WORD kBitsPerSample = 32; // IEEE float

// Activation completion handler: ActivateAudioInterfaceAsync is asynchronous;
// this signals an event when the IAudioClient is ready.
class ActivationHandler
    : public RuntimeClass<RuntimeClassFlags<ClassicCom>,
                          FtmBase,
                          IActivateAudioInterfaceCompletionHandler> {
 public:
  HANDLE event_ = nullptr;
  HRESULT activateResult_ = E_UNEXPECTED;
  ComPtr<IAudioClient> client_;

  ActivationHandler() { event_ = CreateEvent(nullptr, FALSE, FALSE, nullptr); }
  ~ActivationHandler() {
    if (event_) CloseHandle(event_);
  }

  STDMETHOD(ActivateCompleted)(IActivateAudioInterfaceAsyncOperation* op) {
    HRESULT hrActivate = E_UNEXPECTED;
    IUnknown* punk = nullptr;
    HRESULT hr = op->GetActivateResult(&hrActivate, &punk);
    if (SUCCEEDED(hr) && SUCCEEDED(hrActivate) && punk) {
      punk->QueryInterface(IID_PPV_ARGS(&client_));
      punk->Release();
      activateResult_ = S_OK;
    } else {
      activateResult_ = FAILED(hr) ? hr : hrActivate;
    }
    SetEvent(event_);
    return S_OK;
  }
};

class LoopbackCapture {
 public:
  bool Start(Napi::ThreadSafeFunction tsfn, std::string& error);
  void Stop();

 private:
  void CaptureLoop();

  Napi::ThreadSafeFunction tsfn_;
  ComPtr<IAudioClient> client_;
  ComPtr<IAudioCaptureClient> captureClient_;
  HANDLE sampleReadyEvent_ = nullptr;
  std::thread thread_;
  std::atomic<bool> running_{false};
};

bool LoopbackCapture::Start(Napi::ThreadSafeFunction tsfn, std::string& error) {
  tsfn_ = tsfn;

  AUDIOCLIENT_ACTIVATION_PARAMS params = {};
  params.ActivationType = AUDIOCLIENT_ACTIVATION_TYPE_PROCESS_LOOPBACK;
  params.ProcessLoopbackParams.TargetProcessId = GetCurrentProcessId();
  params.ProcessLoopbackParams.ProcessLoopbackMode =
      PROCESS_LOOPBACK_MODE_EXCLUDE_TARGET_PROCESS_TREE;

  PROPVARIANT activateParams = {};
  activateParams.vt = VT_BLOB;
  activateParams.blob.cbSize = sizeof(params);
  activateParams.blob.pBlobData = reinterpret_cast<BYTE*>(&params);

  ComPtr<ActivationHandler> handler = Make<ActivationHandler>();
  if (!handler || !handler->event_) {
    error = "failed to create activation handler";
    return false;
  }

  ComPtr<IActivateAudioInterfaceAsyncOperation> asyncOp;
  HRESULT hr = ActivateAudioInterfaceAsync(
      VIRTUAL_AUDIO_DEVICE_PROCESS_LOOPBACK, __uuidof(IAudioClient),
      &activateParams, handler.Get(), &asyncOp);
  if (FAILED(hr)) {
    error = "ActivateAudioInterfaceAsync failed";
    return false;
  }

  WaitForSingleObject(handler->event_, 5000);
  if (FAILED(handler->activateResult_) || !handler->client_) {
    error = "process loopback activation failed (Windows 10 2004+ required)";
    return false;
  }
  client_ = handler->client_;

  WAVEFORMATEX format = {};
  format.wFormatTag = WAVE_FORMAT_IEEE_FLOAT;
  format.nChannels = kChannels;
  format.nSamplesPerSec = kSampleRate;
  format.wBitsPerSample = kBitsPerSample;
  format.nBlockAlign = format.nChannels * format.wBitsPerSample / 8;
  format.nAvgBytesPerSec = format.nSamplesPerSec * format.nBlockAlign;
  format.cbSize = 0;

  // Process loopback REQUIRES event-driven + shared mode + loopback flags.
  hr = client_->Initialize(
      AUDCLNT_SHAREMODE_SHARED,
      AUDCLNT_STREAMFLAGS_LOOPBACK | AUDCLNT_STREAMFLAGS_EVENTCALLBACK,
      0, 0, &format, nullptr);
  if (FAILED(hr)) {
    error = "IAudioClient::Initialize failed";
    return false;
  }

  sampleReadyEvent_ = CreateEvent(nullptr, FALSE, FALSE, nullptr);
  if (!sampleReadyEvent_) {
    error = "failed to create sample-ready event";
    return false;
  }
  hr = client_->SetEventHandle(sampleReadyEvent_);
  if (FAILED(hr)) {
    error = "SetEventHandle failed";
    return false;
  }

  hr = client_->GetService(IID_PPV_ARGS(&captureClient_));
  if (FAILED(hr)) {
    error = "GetService(IAudioCaptureClient) failed";
    return false;
  }

  hr = client_->Start();
  if (FAILED(hr)) {
    error = "IAudioClient::Start failed";
    return false;
  }

  running_ = true;
  thread_ = std::thread([this] { CaptureLoop(); });
  return true;
}

void LoopbackCapture::CaptureLoop() {
  while (running_) {
    DWORD wait = WaitForSingleObject(sampleReadyEvent_, 200);
    if (!running_) break;
    if (wait != WAIT_OBJECT_0) continue;

    UINT32 packetLength = 0;
    if (FAILED(captureClient_->GetNextPacketSize(&packetLength))) continue;

    while (packetLength != 0 && running_) {
      BYTE* data = nullptr;
      UINT32 numFrames = 0;
      DWORD flags = 0;
      HRESULT hr =
          captureClient_->GetBuffer(&data, &numFrames, &flags, nullptr, nullptr);
      if (FAILED(hr)) break;

      const size_t sampleCount = static_cast<size_t>(numFrames) * kChannels;
      // Copy out of the WASAPI buffer before ReleaseBuffer.
      std::vector<float> chunk(sampleCount);
      if (flags & AUDCLNT_BUFFERFLAGS_SILENT) {
        // Silent packet: zero-filled chunk keeps the stream continuous.
      } else if (data) {
        memcpy(chunk.data(), data, sampleCount * sizeof(float));
      }
      captureClient_->ReleaseBuffer(numFrames);

      if (sampleCount > 0) {
        auto* payload = new std::vector<float>(std::move(chunk));
        napi_status status = tsfn_.BlockingCall(
            payload, [](Napi::Env env, Napi::Function jsCallback,
                        std::vector<float>* samples) {
              Napi::Float32Array arr =
                  Napi::Float32Array::New(env, samples->size());
              memcpy(arr.Data(), samples->data(),
                     samples->size() * sizeof(float));
              delete samples;
              jsCallback.Call({arr});
            });
        if (status != napi_ok) {
          delete payload;
          running_ = false;
          break;
        }
      }

      if (FAILED(captureClient_->GetNextPacketSize(&packetLength))) break;
    }
  }
}

void LoopbackCapture::Stop() {
  running_ = false;
  if (thread_.joinable()) thread_.join();
  if (client_) client_->Stop();
  if (sampleReadyEvent_) {
    CloseHandle(sampleReadyEvent_);
    sampleReadyEvent_ = nullptr;
  }
  captureClient_.Reset();
  client_.Reset();
  if (tsfn_) {
    tsfn_.Release();
    tsfn_ = nullptr;
  }
}

LoopbackCapture g_capture;
std::mutex g_mutex;
bool g_running = false;

Napi::Value Start(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  std::lock_guard<std::mutex> lock(g_mutex);

  if (g_running) {
    Napi::Error::New(env, "loopback already running").ThrowAsJavaScriptException();
    return env.Undefined();
  }
  if (info.Length() < 1 || !info[0].IsFunction()) {
    Napi::TypeError::New(env, "expected (callback)").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  Napi::ThreadSafeFunction tsfn = Napi::ThreadSafeFunction::New(
      env, info[0].As<Napi::Function>(), "audio-loopback", 0, 1);

  std::string error;
  if (!g_capture.Start(tsfn, error)) {
    tsfn.Release();
    Napi::Error::New(env, error).ThrowAsJavaScriptException();
    return env.Undefined();
  }

  g_running = true;
  Napi::Object result = Napi::Object::New(env);
  result.Set("sampleRate", Napi::Number::New(env, kSampleRate));
  result.Set("channels", Napi::Number::New(env, kChannels));
  return result;
}

Napi::Value Stop(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  std::lock_guard<std::mutex> lock(g_mutex);
  if (g_running) {
    g_capture.Stop();
    g_running = false;
  }
  return env.Undefined();
}

}  // namespace

Napi::Object Init(Napi::Env env, Napi::Object exports) {
  exports.Set("start", Napi::Function::New(env, Start));
  exports.Set("stop", Napi::Function::New(env, Stop));
  return exports;
}

NODE_API_MODULE(audio_loopback, Init)

#else  // !_WIN32

// Non-Windows stub so the module loads (and throws clearly) on other platforms.
Napi::Value Start(const Napi::CallbackInfo& info) {
  Napi::Error::New(info.Env(), "process-loopback capture is Windows-only")
      .ThrowAsJavaScriptException();
  return info.Env().Undefined();
}
Napi::Value Stop(const Napi::CallbackInfo& info) { return info.Env().Undefined(); }

Napi::Object Init(Napi::Env env, Napi::Object exports) {
  exports.Set("start", Napi::Function::New(env, Start));
  exports.Set("stop", Napi::Function::New(env, Stop));
  return exports;
}
NODE_API_MODULE(audio_loopback, Init)

#endif
