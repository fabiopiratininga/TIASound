# TIASound - Atari 2600 Sound Chip Emulator

A JavaScript library that emulates the sound capabilities of the Atari 2600's TIA sound chip using the Web Audio API.

## Features

- Emulation of TIA sound chip waveforms
- Support for all original TIA sound types
- Web Audio API implementation

## TIA

The TIA (Television Interface Adapter) is the custom chip designed for the Atari 2600 console that handles both graphics and sound output. While this library focuses on its audio capabilities, the TIA chip was primarily responsible for:

- Video signal generation and synchronization
- Player/missile/ball sprite graphics
- Background playfield graphics
- Two independent audio channels
- Controller input processing

The audio portion could generate various waveforms and effects through manipulation of its registers. This made it possible to create distinctive game sounds despite the limited hardware resources available.

Here’s a breakdown of how it works:

1. Basic Components and Registers:
The TIA sound chip operates primarily through a set of registers, each controlling different aspects of sound generation. The main registers involved in sound generation are:

**AUDC (Audio Control)**: This register defines the type of waveform to be generated (e.g., pure tone, noise, or various types of waveforms like polyphonic patterns). The value written to this register specifies how the sound is shaped and modulated.

**AUDF (Audio Frequency)**: This register defines the frequency of the sound. It sets how fast the waveform is generated. Different values produce different pitches.

**AUDV (Audio Volume)**: This register sets the output volume level of the sound. It's used to control the amplitude or loudness of the sound being generated.

2. Sound Channels:

The TIA chip has two independent sound channels (Channel 0 and Channel 1), each of which can be configured separately with its own frequency, volume, and waveform type.
The TIA chip supports several waveform types, which are defined by the AUDC register

3. Frequency and Sampling:

The AUDF register defines the frequency of the sound. The TIA generates sound by creating a cycle of bits (like a waveform). The rate at which these bits are shifted and the type of pattern they follow  dictates the pitch and timbre of the sound.

4. Audio Output:

The output of the TIA chip is directly tied to its volume and waveform generation. The AUDV register controls the volume of the sound. The generated waveforms (from the AUDC and AUDF settings) are output at the volume set by AUDV. This makes the TIA capable of producing both loud and quiet tones or noises.

5. Timing and Counters:
TIA chip uses counters to keep track of the timing of each sound’s frequency. The sample rate is a crucial aspect of this: for the chip to function properly and generate sound in sync with the rest of the system, it uses internal counters to track how frequently waveforms should be generated, and these counters are reset or modified based on the data written to the frequency registers.

## Installation

```html

<script src="TIASound.js"></script>

```

## Playback Behavior

The TIA chip (and this emulator) features two audio channels that play continuously once started. Unlike modern audio APIs, sounds don't have a defined duration - they keep playing until modified.
Each channel can only play one sound at a time.
Changing parameters instantly affects the ongoing sound.
Set volume to 0 to silence a channel.

## Quick Start

```javascript

const tia = new TIASound();
await tia.init();

// Play a sound on channel 0
tia.play(15, 'square', 8);  // frequency, type, volume

// Configure individual channels
tia.setChannel0(12, 'noise', 8);
tia.setChannel1(8, 'bass', 6);

// Numeric control examples
tia.setChannel0(31, 3, 12);
tia.setChannel1(8, 12, 6); 

```

## Sound Types

- `saw` - Sawtooth wave
- `engine` - Engine noise
- `square` - Square wave
- `bass` - Bass tone
- `pitfall` - Pitfall sound
- `noise` - White noise
- `lead` - Lead synth
- `buzz` - Buzzer tone


## License

MIT License - Copyright (c) 2025 Fabio Cardoso
