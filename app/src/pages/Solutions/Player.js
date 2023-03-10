import React from 'react'
import ReactPlayer from 'react-player'

// Only loads the YouTube player
export default function Player({ src }){
if (!src) return <h1>no source</h1>
return <ReactPlayer 
config={{
    youtube: {
      playerVars: { showinfo: 1, autoplay: 1, muted: 1, modestbranding: 1 }
    },
  }}
  playing={true}
url={src} width='100%' height='100%' autoplay muted playsinline loop />
}