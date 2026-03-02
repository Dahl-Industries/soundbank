import { AnimatePresence, motion } from 'framer-motion'
import { useState } from 'react'
import SoundbankScene from './components/SoundbankScene'

const STRIPE_CHECKOUT_URL = 'https://buy.stripe.com/6oU4gyauE2YxgR964bgUM00'
const QR_WHITE = '/qr/pCB238-white.png'

function BackgroundNoiseLayer() {
  return (
    <svg
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-10 h-full w-full"
      preserveAspectRatio="none"
    >
      <defs>
        <filter id="soundbank-grain-filter" x="0%" y="0%" width="100%" height="100%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="1.05"
            numOctaves="3"
            seed="2"
            stitchTiles="stitch"
            result="noise"
          >
            <animate
              attributeName="baseFrequency"
              dur="9s"
              values="1.02;1.18;1.02"
              repeatCount="indefinite"
            />
            <animate attributeName="seed" dur="3.4s" values="2;3;4;2" repeatCount="indefinite" />
          </feTurbulence>
          <feColorMatrix type="saturate" values="0" in="noise" result="monoNoise" />
        </filter>
      </defs>

      <rect
        width="100%"
        height="100%"
        filter="url(#soundbank-grain-filter)"
        opacity="0.075"
        style={{ mixBlendMode: 'screen' }}
      />
    </svg>
  )
}

function QrCard({ active, onOpen, onClose, onVisit }) {
  return (
    <AnimatePresence mode="sync">
      {!active ? (
        <motion.button
          key="qr-thumb"
          onClick={onOpen}
          className="fixed bottom-20 right-20 z-30 flex h-[11.5rem] w-[11.5rem] items-center justify-center rounded-[26px] border border-white/[0.08] bg-[#1a1a1a]/90 p-2.5 shadow-[0_20px_60px_rgba(0,0,0,0.7)] backdrop-blur-md"
          initial={{ opacity: 0, scale: 0.92, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.92, y: 12 }}
          transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          aria-label="Open QR code"
        >
          <img
            src={QR_WHITE}
            alt="QR code"
            className="h-full w-full"
            draggable={false}
          />
        </motion.button>
      ) : (
        <motion.div
          key="qr-overlay"
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/95"
          onClick={onClose}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <button
            type="button"
            onClick={onClose}
            className="absolute left-5 top-5 flex h-10 w-10 items-center justify-center rounded-full bg-white/[0.06] text-[26px] font-light leading-none text-white/40 transition hover:bg-white/10 hover:text-white/60"
            aria-label="Close"
          >
            ×
          </button>

          <div className="flex flex-col items-center gap-5">
            <div
              onClick={(e) => {
                e.stopPropagation()
                onVisit()
              }}
              className="flex h-[17rem] w-[17rem] cursor-pointer items-center justify-center rounded-[22px] border border-white/[0.08] bg-[#1a1a1a]/90 p-4 shadow-[0_24px_80px_rgba(0,0,0,0.6)] backdrop-blur-md"
            >
              <img
                src={QR_WHITE}
                alt="QR code"
                className="h-full w-full"
                draggable={false}
              />
            </div>

            <p className="font-soundbank text-[15px] font-semibold tracking-[0.02em] text-[#999]">
              Get Soundbank
            </p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export default function App() {
  const [qrOpen, setQrOpen] = useState(false)

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-black font-soundbank text-white">
      <div className="absolute inset-0 z-0 bg-black" />

      <div className="absolute inset-0 z-[5]">
        <SoundbankScene />
      </div>

      <BackgroundNoiseLayer />

      {!qrOpen && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center px-4">
          <div className="text-center">
            <h1 className="text-3xl font-semibold tracking-tight text-white md:text-5xl">
              Soundbank™
            </h1>
          </div>
        </div>
      )}

      <QrCard
        active={qrOpen}
        onOpen={() => setQrOpen(true)}
        onClose={() => setQrOpen(false)}
        onVisit={() => window.open(STRIPE_CHECKOUT_URL, '_blank', 'noopener,noreferrer')}
      />
    </main>
  )
}
