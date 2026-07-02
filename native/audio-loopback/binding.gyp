{
  "targets": [
    {
      "target_name": "audio_loopback",
      "sources": ["src/loopback.cc"],
      "include_dirs": [
        "<!@(node -p \"require('node-addon-api').include\")"
      ],
      "cflags!": ["-fno-exceptions"],
      "cflags_cc!": ["-fno-exceptions"],
      "conditions": [
        ["OS=='win'", {
          "libraries": [
            "-lmmdevapi",
            "-lole32",
            "-lksuser",
            "-lavrt"
          ],
          "defines": ["_UNICODE", "UNICODE"],
          "msvs_settings": {
            "VCCLCompilerTool": {
              "ExceptionHandling": 1,
              "AdditionalOptions": ["/std:c++17"]
            }
          }
        }]
      ]
    }
  ]
}
