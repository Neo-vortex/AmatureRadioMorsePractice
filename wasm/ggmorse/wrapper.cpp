#include "ggmorse/ggmorse.h"
#include <algorithm>
#include <cstring>
#include <string>
#include <vector>

// Push-based wrapper: ggmorse pulls audio through a callback, so samples are queued
// here and handed over in the exact frame sizes it asks for.
struct Decoder {
    GGMorse morse;
    std::vector<float> queue;
    std::vector<float> input;
    std::string text;
    explicit Decoder(const GGMorse::Parameters & p) : morse(p) {}
};

extern "C" {

Decoder * gm_create(float sampleRate) {
    GGMorse::Parameters p = GGMorse::getDefaultParameters();
    p.sampleRateInp = sampleRate;
    p.sampleRateOut = sampleRate;
    p.sampleFormatInp = GGMORSE_SAMPLE_FORMAT_F32;
    p.sampleFormatOut = GGMORSE_SAMPLE_FORMAT_F32;
    auto * d = new Decoder(p);
    auto dp = GGMorse::getDefaultParametersDecode();
    dp.frequency_hz = -1.0f; // auto pitch
    dp.speed_wpm = -1.0f;    // auto speed
    d->morse.setParametersDecode(dp);
    return d;
}

float * gm_input(Decoder * d, int n) {
    d->input.resize(n);
    return d->input.data();
}

// Queues the n samples written to gm_input() and decodes as far as they reach.
void gm_push(Decoder * d, int n) {
    d->queue.insert(d->queue.end(), d->input.begin(), d->input.begin() + n);
    size_t pos = 0;
    d->morse.decode([&](void * data, uint32_t nMaxBytes) -> uint32_t {
        size_t want = nMaxBytes / sizeof(float);
        if (d->queue.size() - pos < want) return 0;
        std::memcpy(data, d->queue.data() + pos, nMaxBytes);
        pos += want;
        return nMaxBytes;
    });
    d->queue.erase(d->queue.begin(), d->queue.begin() + pos);
    GGMorse::TxRx rx;
    if (d->morse.takeRxData(rx) > 0) d->text.append(rx.begin(), rx.end());
}

// Returns decoded text since the last call (NUL-terminated, valid until the next call).
const char * gm_take_text(Decoder * d) {
    static std::string out;
    out.swap(d->text);
    d->text.clear();
    return out.c_str();
}

float gm_pitch(Decoder * d) { return d->morse.getStatistics().estimatedPitch_Hz; }
float gm_wpm(Decoder * d) { return d->morse.getStatistics().estimatedSpeed_wpm; }
void gm_destroy(Decoder * d) { delete d; }

}
