// Windows low-level keyboard and mouse hooks for push-to-talk.
//
// Electron's globalShortcut reports key-down only, so holding a key to talk
// while a game has focus needs the release from somewhere else. A
// WH_KEYBOARD_LL hook sees both for every key on the desktop, and a
// WH_MOUSE_LL hook does the same for the side buttons. The mouse hook is only
// installed when a side button is bound: it is called for every mouse move.
//
// The hook runs on its own thread with its own message loop: Windows silently
// removes a low-level hook whose thread is slow to answer, and the Electron
// main thread is sometimes busy for longer than that.
//
// Only the scan codes passed to start() are reported, and only when their state
// changes, so key repeat never reaches JS and no other keystroke leaves this
// file. Keys are never swallowed: the game still sees the key.
//
// A key-up the hook never sees would leave the mic open, so while a watched key
// is down the thread also polls GetAsyncKeyState for it and reports the release
// itself. That covers a key-up that arrives with a different extended flag than
// its key-down, and one swallowed by the secure desktop (UAC, Win+L). The poll
// only releases a key it has itself seen held: when another hook (mouse or
// macro software) swallows the press, the async state never shows it down, and
// the hook's own key-up is the only release to trust.
//
// API: start(codes: number[], cb(code: number, down: boolean)); stop().
// start() replaces a running hook. Keyboard codes are set-1 scan codes with
// 0xE000 added for the extended prefix; the side buttons are 0x10001 (XBUTTON1)
// and 0x10002 (XBUTTON2). See src/shared/push-to-talk-keys.ts.

#include <napi.h>

#ifdef _WIN32

#include <windows.h>
#include <mutex>
#include <string>
#include <unordered_map>

namespace {

constexpr uint32_t kMaxKeys = 8;
constexpr UINT kPollMs = 150;
constexpr uint32_t kMouseBase = 0x10000;

struct KeyEvent {
  uint32_t code;
  bool down;
};

struct KeyState {
  bool down = false;
  // The virtual key that went down, polled until it is up.
  DWORD vk = 0;
  bool seenHeld = false;
};

// Written only while no hook thread runs, used only by the hook thread, so
// neither the hook procedure nor the poll needs a lock.
std::unordered_map<uint32_t, KeyState> g_watched;
Napi::ThreadSafeFunction g_tsfn;
// A raw handle rather than std::thread: a joinable std::thread destroyed at
// process exit calls std::terminate, and the app can quit without stop().
HANDLE g_thread = nullptr;
DWORD g_threadId = 0;
std::mutex g_mutex;

void CallJs(Napi::Env env, Napi::Function callback, KeyEvent* event) {
  // env is null when the function is being torn down with calls still queued.
  if (env != nullptr && callback != nullptr) {
    callback.Call({Napi::Number::New(env, event->code),
                   Napi::Boolean::New(env, event->down)});
  }
  delete event;
}

void Report(uint32_t code, bool down) {
  auto* event = new KeyEvent{code, down};
  if (g_tsfn.NonBlockingCall(event, CallJs) != napi_ok) delete event;
}

void Update(uint32_t code, bool down, DWORD vk) {
  auto it = g_watched.find(code);
  if (it == g_watched.end() || it->second.down == down) return;
  it->second = KeyState{down, vk, false};
  Report(code, down);
}

LRESULT CALLBACK KeyboardProc(int nCode, WPARAM wParam, LPARAM lParam) {
  if (nCode == HC_ACTION) {
    const auto* key = reinterpret_cast<const KBDLLHOOKSTRUCT*>(lParam);
    uint32_t code =
        key->scanCode | ((key->flags & LLKHF_EXTENDED) ? 0xE000u : 0u);
    // Right Shift sometimes arrives flagged extended; it has no extended twin.
    if (code == 0xE036) code = 0x36;
    Update(code, wParam == WM_KEYDOWN || wParam == WM_SYSKEYDOWN, key->vkCode);
  }
  return CallNextHookEx(nullptr, nCode, wParam, lParam);
}

LRESULT CALLBACK MouseProc(int nCode, WPARAM wParam, LPARAM lParam) {
  if (nCode == HC_ACTION &&
      (wParam == WM_XBUTTONDOWN || wParam == WM_XBUTTONUP)) {
    const auto* mouse = reinterpret_cast<const MSLLHOOKSTRUCT*>(lParam);
    const WORD button = HIWORD(mouse->mouseData);
    Update(kMouseBase | button, wParam == WM_XBUTTONDOWN,
           button == XBUTTON1 ? VK_XBUTTON1 : VK_XBUTTON2);
  }
  return CallNextHookEx(nullptr, nCode, wParam, lParam);
}

void PollHeldKeys() {
  for (auto& [code, state] : g_watched) {
    if (!state.down || state.vk == 0) continue;
    if (GetAsyncKeyState(static_cast<int>(state.vk)) & 0x8000) {
      state.seenHeld = true;
    } else if (state.seenHeld) {
      state.down = false;
      Report(code, false);
    }
  }
}

struct ThreadStart {
  HANDLE ready;
  bool keyboard;
  bool mouse;
  DWORD error;
};

HHOOK Install(bool wanted, int id, HOOKPROC proc, DWORD* error) {
  if (!wanted || *error != 0) return nullptr;
  HHOOK hook = SetWindowsHookExW(id, proc, GetModuleHandleW(nullptr), 0);
  if (!hook) *error = GetLastError();
  return hook;
}

DWORD WINAPI HookThread(LPVOID param) {
  auto* start = static_cast<ThreadStart*>(param);
  HHOOK keyboard =
      Install(start->keyboard, WH_KEYBOARD_LL, KeyboardProc, &start->error);
  HHOOK mouse = Install(start->mouse, WH_MOUSE_LL, MouseProc, &start->error);
  const bool ok = start->error == 0;
  // Creates this thread's message queue before stop() can post WM_QUIT to it.
  MSG msg;
  PeekMessageW(&msg, nullptr, WM_USER, WM_USER, PM_NOREMOVE);
  SetEvent(start->ready);

  if (ok) {
    const UINT_PTR timer = SetTimer(nullptr, 0, kPollMs, nullptr);
    while (GetMessageW(&msg, nullptr, 0, 0) > 0) {
      if (msg.message == WM_TIMER) PollHeldKeys();
    }
    if (timer) KillTimer(nullptr, timer);
  }
  if (keyboard) UnhookWindowsHookEx(keyboard);
  if (mouse) UnhookWindowsHookEx(mouse);
  return ok ? 0 : 1;
}

void StopLocked() {
  if (!g_thread) return;
  PostThreadMessageW(g_threadId, WM_QUIT, 0, 0);
  // The thread only unhooks and returns once it sees WM_QUIT. Not waiting for
  // it would free g_watched and the function under a hook still running.
  WaitForSingleObject(g_thread, INFINITE);
  CloseHandle(g_thread);
  g_thread = nullptr;
  g_threadId = 0;
  g_watched.clear();
  g_tsfn.Release();
}

Napi::Value Start(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  std::lock_guard<std::mutex> lock(g_mutex);

  if (info.Length() < 2 || !info[0].IsArray() || !info[1].IsFunction()) {
    Napi::TypeError::New(env, "expected (codes, callback)")
        .ThrowAsJavaScriptException();
    return env.Undefined();
  }
  Napi::Array codes = info[0].As<Napi::Array>();
  if (codes.Length() == 0 || codes.Length() > kMaxKeys) {
    Napi::RangeError::New(env, "expected 1 to 8 codes")
        .ThrowAsJavaScriptException();
    return env.Undefined();
  }

  StopLocked();
  for (uint32_t i = 0; i < codes.Length(); i++) {
    Napi::Value value = codes.Get(i);
    if (!value.IsNumber()) {
      g_watched.clear();
      Napi::TypeError::New(env, "codes must be numbers")
          .ThrowAsJavaScriptException();
      return env.Undefined();
    }
    g_watched[value.As<Napi::Number>().Uint32Value()] = KeyState{};
  }

  g_tsfn = Napi::ThreadSafeFunction::New(env, info[1].As<Napi::Function>(),
                                         "keyboard-hook", 0, 1);
  // A hook left running must not keep the process alive on its own.
  g_tsfn.Unref(env);

  // start lives on this stack, so the thread may only be started when it can
  // signal back before this function returns.
  ThreadStart start{CreateEventW(nullptr, TRUE, FALSE, nullptr), false, false,
                    0};
  for (const auto& entry : g_watched) {
    (entry.first >= kMouseBase ? start.mouse : start.keyboard) = true;
  }
  if (start.ready) {
    g_thread = CreateThread(nullptr, 0, HookThread, &start, 0, &g_threadId);
    if (g_thread) WaitForSingleObject(start.ready, INFINITE);
    CloseHandle(start.ready);
  }

  if (!g_thread || start.error != 0) {
    const DWORD error = g_thread ? start.error : GetLastError();
    if (g_thread) {
      WaitForSingleObject(g_thread, INFINITE);
      CloseHandle(g_thread);
    }
    g_thread = nullptr;
    g_threadId = 0;
    g_watched.clear();
    g_tsfn.Release();
    Napi::Error::New(env, "SetWindowsHookEx failed: " + std::to_string(error))
        .ThrowAsJavaScriptException();
  }
  return env.Undefined();
}

Napi::Value Stop(const Napi::CallbackInfo& info) {
  std::lock_guard<std::mutex> lock(g_mutex);
  StopLocked();
  return info.Env().Undefined();
}

}  // namespace

#else  // !_WIN32

namespace {

// Non-Windows stub so the module loads (and throws clearly) on other platforms.
Napi::Value Start(const Napi::CallbackInfo& info) {
  Napi::Error::New(info.Env(), "keyboard hook is Windows-only")
      .ThrowAsJavaScriptException();
  return info.Env().Undefined();
}
Napi::Value Stop(const Napi::CallbackInfo& info) {
  return info.Env().Undefined();
}

}  // namespace

#endif

Napi::Object Init(Napi::Env env, Napi::Object exports) {
  exports.Set("start", Napi::Function::New(env, Start));
  exports.Set("stop", Napi::Function::New(env, Stop));
  return exports;
}

NODE_API_MODULE(keyboard_hook, Init)
