import { Lazy } from "./utils/Lazy.js"
import { OrganyaMusicPlayer } from "./organya/OrganyaMusicPlayer.js"
import type { OrganyaSong } from "./organya/OrganyaSong.js"
import { readOrganyaSong } from "./organya/readOrganyaSong.js"

const audioContext = new Lazy(() => new AudioContext({ latencyHint: "interactive" }))

// Init music controls.

const musicControlsTemplate = document.getElementById("music-controls-template") as HTMLTemplateElement
const musicControlsClone = musicControlsTemplate.content.cloneNode(true) as DocumentFragment
const musicControls = musicControlsClone.firstElementChild as HTMLFormElement
//const musicStatus = musicControls.querySelector<HTMLSpanElement>(".status")!
const musicOptions = musicControls.querySelector<HTMLInputElement>(".options")!
const musicStop = musicControls.querySelector<HTMLInputElement>(".stop")!

const melodyWaveformData = await (async () => {
  const res = await fetch(new URL("data/WAVE/WAVE100", import.meta.url))
  if (!res.ok) {
    throw new Error("Failed to fetch melody waveform data.")
  }

  return await res.arrayBuffer()
})()

const percussionSamples: (AudioBuffer | undefined)[] = []

const percussionNames = [
  "BASS01",
  "BASS02",
  "SNARE01",
  "SNARE02",
  "TOM01", 

  "HICLOSE",
  "HIOPEN",
  "CRASH",
  "PER01",
  "PER02", 

  "BASS03",
  "TOM02",
  "BASS04",
  "BASS05",
  "SNARE03", 

  "SNARE04",
  "HICLOSE02",
  "HIOPEN02",
  "HICLOSE03",
  "HIOPEN03", 

  "CRASH02",
  "REVSYM01",
  "RIDE01",
  "TOM03",
  "TOM04", 

  "ORCDRM01",
  "BELL",
  "CAT" ,
  "BASS06",
  "BASS07", 

  "SNARE05",
  "SNARE06",
  "SNARE07",
  "TOM05",
  "HIOPEN04", 

  "HICLOSE04",
  "CLAP01",
  "PESI01",
  "QUICK01",
  "BASS08" , 

  "SNARE08",
  "HICLOSE05",
]

function rbufferle(bits: number, i8a: Uint8Array, index: number): number {
  let num = 0
  let bytes = bits / 8
  for (let i = 0; i < bytes; ++i) {
    num |= i8a[index + i]! << ((bytes - i - 1) * 8);
  }
  return num
}

async function loadWav(name: string): Promise<AudioBuffer | undefined> {
  const res = await fetch(new URL(`./data/WAVE/${name}`, import.meta.url))
  if (!res.ok) {
    document.body.innerHTML = name
    throw new Error("Failed to fetch percussion waveform data.")
  }
  const buf = await res.arrayBuffer()
  const view = new DataView(buf)
  const i8a = new Uint8Array(buf)
  let i = 0
  const riffc = view.getUint32(i, true); i += 8 // skip
  if (riffc != 0x46464952) { // 'RIFF'
    throw new Error(`Invalid RIFF ${name}`)
  }
  const wavec = view.getUint32(i, true); i += 4
  if (wavec != 0x45564157) { // 'WAVE'
    throw new Error(`Invalid WAVE ${name}`)
  }
  const fmt_c = view.getUint32(i, true); i += 8 // skip
  if (fmt_c != 0x20746d66) { // 'fmt '
    throw new Error(`Invalid fmt  ${name}`)
  }

  const aFormat = view.getUint16(i, true); i += 2
  if (aFormat != 1) {
    throw new Error(`Invalid format ${name}`)
  }

  const channels = view.getUint16(i, true); i += 2
  const samples = view.getUint32(i, true); i += 10 // skip
  const bits = view.getUint16(i, true); i += 2

  if (view.getUint32(i + 2, true) == 0x74636166) { // 'fact'
    i += 6;
    i += view.getUint32(i, true); i += 4;
  }
  
  const datac = view.getUint32(i, true); i += 4
  if (datac != 0x61746164) { // 'data'
    throw new Error(`Invalid data ${name}`)
  }
  
  const length = view.getUint32(i, true); i += 4
  
  const mdb = (2 ** bits) / 2
  const audioBuffer = new AudioBuffer({ numberOfChannels: channels, length: length / channels, sampleRate: samples })
  for (let j = 0; j < length; j += channels) {
    for (let k = 0; k < channels; k++) {
      const channelBuffer = audioBuffer.getChannelData(k)
      let br = rbufferle(bits, i8a, i + j + k)
      if (bits <= 8) br -= mdb
      else br = br << (32 - bits) >> (32 - bits) // goofy hack
      channelBuffer[j / channels] = br / mdb
    }
  }
  return audioBuffer
}

for (let i = 0; i < percussionNames.length; i++) {
  percussionSamples[i] = await loadWav(percussionNames[i]!);
}

const musicPlayer = new Lazy<OrganyaMusicPlayer>(() => {
  const musicPlayer = new OrganyaMusicPlayer(audioContext.value, melodyWaveformData, percussionSamples)

  const gainNode = audioContext.value.createGain()
  gainNode.gain.value = .75
  musicPlayer.connect(gainNode)
  gainNode.connect(audioContext.value.destination)

  return musicPlayer
})

function setSelectedSong(): void {
  const selectedSongFile = musicOptions.files![0]
  if (selectedSongFile == undefined) {
    return
  }
  const reader = new FileReader()
  reader.onload = function() {
    const song = readOrganyaSong(reader.result as ArrayBuffer, (level, message) => {
      if (level === "warning") {
        console.warn(message)
      } else {
        console.error(message)
      }
    })
    if (musicPlayer.value.song !== song) {
      musicPlayer.value.song = song
    }
  }
  reader.readAsArrayBuffer(selectedSongFile!)
}

musicOptions.addEventListener("change", setSelectedSong)
musicControls.addEventListener("submit", e => {
  e.preventDefault()
  if (e.submitter === musicStop) {
    musicPlayer.value.pause()
    musicPlayer.value.position = 0
  } else {
    musicPlayer.value.state === "paused" ? musicPlayer.value.play() : musicPlayer.value.pause()
  }
})

// Insert music controls.

const soundTestContainer = document.getElementById("sound-test") as HTMLElement
for (const childNode of soundTestContainer.childNodes) {
  childNode.remove()
}
soundTestContainer.append(musicControls)

// Rendering

const canvas = document.getElementById("organya-canvas") as HTMLCanvasElement
  
if (canvas != undefined) {
  const context = canvas.getContext("2d") as CanvasRenderingContext2D

  const orgTex = new Image()
  
  const noteWidth = 16
  
  let hScroll = 0
  let vScroll = 36
  let curTrack = 0
    
  function drawNotes(song: OrganyaSong, track: number): void {
    song.tracks[track]!.notes.forEach((note) => {
      if (note.pitch == 255) return
      
      const np = note.pitch % 12
      const darkNote = np == 1 || np == 3 || np == 6 || np == 8 || np == 10
      
      const x = 64 + (note.start - hScroll) * noteWidth;
      const y = (95 - note.pitch - vScroll) * 12
      if (x > canvas.width) return
      if (y < 0 || y >= canvas.height - 144) return
      
      let txx = 176 + (track % 2) * noteWidth
      let txy = 11 + ((track % 8) / 2 | 0) * 6 + (track == curTrack ? 24 : 0)
      if ((track / 8 | 0) != (curTrack / 8 | 0)) {
        txx = 256
        txy = 64 + (darkNote ? 6 : 0)
      }
      
      context.drawImage(orgTex, txx, txy, noteWidth, 6, x, y + 2, noteWidth, 6)
      
      for (let j = 1; j < note.duration; j++) {
        txy = (track == curTrack ? 0 : 32) + (track % 8) * 4
        if ((track / 8 | 0) != (curTrack / 8 | 0)) {
          txy = 76 + (darkNote ? 4 : 0)
        }
        context.drawImage(orgTex, 256, txy, noteWidth, 4, x + (j * noteWidth), y + 3, noteWidth, 4)
      }
    })
  }

  function renderInterface() {
    const song = musicPlayer.value.song
    
    const songLine = song == undefined ? 4 : song.beatsPerBar
    const songDot = song == undefined ? 4 : song.stepsPerBeat
    const songStart = song == undefined ? 0 : song.repeatStart
    const songEnd = song == undefined ? 1600 : song.repeatEnd
    
    if (musicPlayer.value.state === "playing") hScroll = Math.floor(musicPlayer.value.position + 0.001) // hack
    
    context.clearRect(0, 0, canvas.width, canvas.height)
    
    const measScroll = hScroll % (songLine * songDot)
    
    for (let i = 0 - (vScroll % 12) * 12; i < canvas.height - 144; i += 144) {
      for (let j = measScroll; j < (canvas.width / noteWidth | 0) + measScroll; j++) {
        const x = 64 + j * noteWidth - measScroll * noteWidth;
        if (x < 64) continue;
        if (x >= canvas.width) break;
        let offset = 32;
        if (j % (songLine * songDot) == 0) offset = 0
        else if (j % songDot == 0) offset = 16
        context.drawImage(orgTex, 64 + offset, 160, noteWidth, 144, x, i, noteWidth, 144)
      }
    }
    
    const selPerc = ((curTrack / 8 | 0) % 2) == 1
    
    if (song != undefined) {
      if (selPerc) {
        for (let i = 8; i < 16; i++) {
          if (i != curTrack) drawNotes(song, i)
        }
        for (let i = 0; i < 8; i++) {
          if (i != curTrack) drawNotes(song, i)
        }
      } else {
        for (let i = 0; i < 16; i++) {
          if (i != curTrack) drawNotes(song, i)
        }
      }
      drawNotes(song, curTrack)
    }
      
    const rx = (songStart - hScroll) * 16 + 64;
    const ex = (songEnd - hScroll) * 16 + 64;
    if (rx >= 64 && rx < canvas.width) {
      context.drawImage(orgTex, 176, 0, noteWidth, 144, rx, canvas.height - 144 - 11, noteWidth, 144)
    }
    if (ex >= 64 && ex < canvas.width) {
      context.drawImage(orgTex, 192, 0, noteWidth, 144, ex, canvas.height - 144 - 11, noteWidth, 144)
    }
    
    for (let i = hScroll - 4; i < (canvas.width / 16 | 0) + hScroll; i++) {
      if (i % (songLine * songDot) != 0) continue
      let x = 64 + i * noteWidth - hScroll * noteWidth
      if (x < 0 || x >= canvas.width) break
      
      let meas = i / (songLine * songDot) | 0
      let k1000 = 0
      let k100 = 0
      let k10 = 0
      while (meas >= 1000) {
        k1000++
        meas -= 1000
      }
      while (meas >= 100) {
        k100++
        meas -= 100
      }
      while (meas >= 10) {
        k10++
        meas -= 10
      }
      
      if (k1000 > 0) {
        context.drawImage(orgTex, 176 + (k1000 * 8), 136, 8, 12, x + 0, 0, 8, 12)
        x += 8
      }
      context.drawImage(orgTex, 176 + (k100 * 8), 136, 8, 12, x + 0, 0, 8, 12)
      context.drawImage(orgTex, 176 + (k10 * 8), 136, 8, 12, x + 8, 0, 8, 12)
      context.drawImage(orgTex, 176 + (meas * 8), 136, 8, 12, x + 16, 0, 8, 12)
    }
    
    for (let i = 0; i < 8; i++) {
      const y = -(vScroll % 12) * 12 + (i * 144) + 0
      if (y < -144 || y >= canvas.height - 144) continue
      context.drawImage(orgTex, 0, 160, 64, 144, 0, y, 64, 144)
    }
    
    for (let i = 0; i < 8; i++) {
      const y = (95 - vScroll - i * 12) * 12
      if (y < -12 || y >= canvas.height - 144) continue
      context.drawImage(orgTex, 176 + (i * 8), 148, 8, 12, 55, y, 8, 12)
    }
    
    for (let j = measScroll; j < (canvas.width / noteWidth | 0) + measScroll; j++) {
      const x = 64 + j * noteWidth - measScroll * noteWidth;
      if (x < 64) continue;
      if (x >= canvas.width) break;
      let offset = 32;
      if (j % (songLine * songDot) == 0) offset = 0
      else if (j % songDot == 0) offset = 16
      context.drawImage(orgTex, 64 + offset, 0, noteWidth, 144, x, canvas.height - 144, noteWidth, 144)
    }
    
    if (song != undefined) {
      song.tracks[curTrack]!.notes.forEach((note) => {
        const x = 64 + (note.start - hScroll) * noteWidth;
        if (x > canvas.width) return
        if (note.pan != 255) {
          context.drawImage(orgTex, 207, 0, noteWidth, 5, x, canvas.height - 81 - (note.pan * 5), noteWidth, 5)
        }
        if (note.volume != 255) {
          context.drawImage(orgTex, 207, 0, noteWidth, 5, x, canvas.height - 6 - (note.volume / 4 | 0), noteWidth, 5)
        }
      })
    }
    
    context.drawImage(orgTex, 0, 0, 64, 144, 0, canvas.height - 144, 64, 144)
      
    requestAnimationFrame(renderInterface)
  }
    
  orgTex.onload = () => requestAnimationFrame(renderInterface)
  orgTex.src = "/BITMAP/MUSIC.png"
  
  canvas.addEventListener("wheel", (e) => {
    e.preventDefault()
    
    if (e.deltaY < 0) {
      vScroll -= 4
      if (vScroll < 0) vScroll = 0
    } else if (e.deltaY > 0) {
      vScroll += 4
      if (vScroll > 95) vScroll = 95
    }
  })
  addEventListener("keydown", (e) => {
    switch(e.code) {
    case "Digit1": curTrack = 0; break;
    case "Digit2": curTrack = 1; break;
    case "Digit3": curTrack = 2; break;
    case "Digit4": curTrack = 3; break;
    case "Digit5": curTrack = 4; break;
    case "Digit6": curTrack = 5; break;
    case "Digit7": curTrack = 6; break;
    case "Digit8": curTrack = 7; break;
    case "KeyQ": curTrack = 8; break;
    case "KeyW": curTrack = 9; break;
    case "KeyE": curTrack = 10; break;
    case "KeyR": curTrack = 11; break;
    case "KeyT": curTrack = 12; break;
    case "KeyY": curTrack = 13; break;
    case "KeyU": curTrack = 14; break;
    case "KeyI": curTrack = 15; break;
    
    case "ArrowUp":
      vScroll -= (e.shiftKey ? 12 : 1)
      if (vScroll < 0) vScroll = 0
      break;
    case "ArrowDown":
      vScroll += (e.shiftKey ? 12 : 1)
      if (vScroll > 95) vScroll = 95
      break;
    case "ArrowLeft": {
      const songLine = musicPlayer.value.song == undefined ? 4 : musicPlayer.value.song.beatsPerBar
      const songDot = musicPlayer.value.song == undefined ? 4 : musicPlayer.value.song.stepsPerBeat
      
      const k = songLine * songDot
      
      if (e.ctrlKey) hScroll = 0
      else {
        if (e.shiftKey) hScroll = ((hScroll - 1) / k | 0) * k
        else hScroll--
        
        if (hScroll < 0) hScroll = 0
      }
      
      musicPlayer.value.position = hScroll
      break;
    }
    case "ArrowRight": {
      const songLine = musicPlayer.value.song == undefined ? 4 : musicPlayer.value.song.beatsPerBar
      const songDot = musicPlayer.value.song == undefined ? 4 : musicPlayer.value.song.stepsPerBeat
      const songEnd = musicPlayer.value.song == undefined ? 1600 : musicPlayer.value.song.repeatEnd
      
      const k = songLine * songDot
      
      if (e.ctrlKey) hScroll = songEnd
      else {
        if (e.shiftKey) hScroll = ((hScroll / k | 0) + 1) * k
        else hScroll++
      }
      
      musicPlayer.value.position = hScroll
      break;
    }
    default: return
    }
    
    e.preventDefault()
  })
}
