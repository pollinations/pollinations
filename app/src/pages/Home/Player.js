import React from 'react'
import ReactPlayer from 'react-player'

// Only loads the YouTube player
export default function Player({ src }){
if (!src) return <h1>no source</h1>
return <ReactPlayer 
style={{
  position: 'absolute',
  top: '50%',
  left: '50%',
  minWidth: '100vw',
  minHeight: '100vh',
  transform: 'translate(-50%, -50%)',
  zIndex: -1
}}
config={{
    youtube: {
      playerVars: { showinfo: 1, autoplay: 1, muted: 1, modestbranding: 1 }
    },
  }}
  playing={true}
url={src} width='1920' height='1080'  autoplay muted playsinline loop />
}