# TIASound - Atari 2600 Sound Chip Emulator

A JavaScript library that emulates the sound capabilities of the Atari 2600's TIA sound chip using the Web Audio API.

## Features

- Emulation of TIA sound chip waveforms
- Support for all original TIA sound types
- Web Audio API implementation

## Installation

```html

<script src="TIASound.js"></script>

```

## Playback Behavior

The TIA chip (and this emulator) features two audio channels that play continuously once started. Unlike modern audio APIs:

Sounds don't have a defined duration - they keep playing until modified
Each channel can only play one sound at a time
Changing parameters instantly affects the ongoing sound
Set volume to 0 to silence a channel

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