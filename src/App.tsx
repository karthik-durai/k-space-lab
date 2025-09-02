import { useEffect, useState } from 'react'
import ImagePicker from './components/ImagePicker'
import Preview from './components/Preview'
import Spinner from './components/Spinner'
import Modal from './components/Modal'
import ControlPanel from './components/ControlPanel'
import { computeKSpaceAndRecon } from './lib/kspace'

function App() {
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [kspaceUrl, setKspaceUrl] = useState<string | null>(null)
  const [reconUrl, setReconUrl] = useState<string | null>(null)
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const STORAGE = {
    src: 'kspace:src',
    kspace: 'kspace:kspace',
    recon: 'kspace:recon',
  }

  // No mathjs instance needed here; computed in lib/kspace

  const onSelectFile = (file: File) => {
    if (!file.type.startsWith('image/')) {
      setError('Please select an image file')
      return
    }
    setError(null)
    // Read as data URL for persistence across refresh/close
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = String(reader.result || '')
      setImageUrl(dataUrl)
      setKspaceUrl(null)
      setReconUrl(null)
      try {
        localStorage.setItem(STORAGE.src, dataUrl)
        // Clear previous computed images until new ones are ready
        localStorage.removeItem(STORAGE.kspace)
        localStorage.removeItem(STORAGE.recon)
      } catch {}
      void processImage(dataUrl)
    }
    reader.onerror = () => {
      setError('Failed to read the selected file')
    }
    reader.readAsDataURL(file)
  }

  // Restore persisted state on mount
  useEffect(() => {
    try {
      const savedSrc = localStorage.getItem(STORAGE.src)
      const savedK = localStorage.getItem(STORAGE.kspace)
      const savedR = localStorage.getItem(STORAGE.recon)
      if (savedSrc) setImageUrl(savedSrc)
      if (savedK) setKspaceUrl(savedK)
      if (savedR) setReconUrl(savedR)
      // If source exists but computed results are missing, compute
      if (savedSrc && (!savedK || !savedR)) {
        void processImage(savedSrc)
      }
    } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function processImage(url: string) {
    try {
      setProcessing(true)
      const { kspaceUrl, reconUrl } = await computeKSpaceAndRecon(url, 256)
      setKspaceUrl(kspaceUrl)
      setReconUrl(reconUrl)
      try {
        localStorage.setItem(STORAGE.kspace, kspaceUrl)
        localStorage.setItem(STORAGE.recon, reconUrl)
      } catch {}
    } catch (err) {
      console.error(err)
      setError('Failed to process image for FFT')
    } finally {
      setProcessing(false)
    }
  }

  const clearSelection = () => {
    setImageUrl(null)
    setKspaceUrl(null)
    setReconUrl(null)
    setPreviewOpen(false)
    try {
      localStorage.removeItem(STORAGE.src)
      localStorage.removeItem(STORAGE.kspace)
      localStorage.removeItem(STORAGE.recon)
    } catch {}
  }

  return (
    <main className="h-screen max-w-6xl mx-auto p-4 md:p-6 flex flex-col space-y-3">
      {/* Row 1: heading + picker (left) and image preview (right) */}
      <div className="flex justify-between">
        <div>
          <h1 className="text-2xl font-semibold">K-Space Lab</h1>
          <p className="text-gray-600 mt-2">PNG, JPG or WEBP</p>
          <ImagePicker onSelect={onSelectFile} />
          {imageUrl && (
            <div className="mt-2">
              <button
                type="button"
                onClick={clearSelection}
                className="inline-flex items-center rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
              >
                Remove selected image
              </button>
            </div>
          )}
          {error && <div className="mt-3 text-sm text-red-600">{error}</div>}
        </div>
        <Preview title="Image (click to enlarge)" bodyClassName="p-1 flex items-center justify-end bg-transparent border-none">
          {imageUrl ? (
            <div className="w-32 h-32 md:w-40 md:h-40 border-2 rounded-lg">
              <img
                src={imageUrl}
                alt="Selected"
                className="block h-full w-full object-cover rounded-md cursor-zoom-in"
                onClick={() => setPreviewOpen(true)}
              />
            </div>
          ) : (
            <div className="p-6 text-sm text-gray-500">No image selected</div>
          )}
        </Preview>
      </div>

      {/* Row 2: control panel */}
      <div>
        <Preview title="Edit K-space">
          <ControlPanel />
        </Preview>
      </div>

      {/* Row 3: k-space and reconstructed image; fill remaining viewport height on desktop */}
      <div className="flex-1 flex justify-between flex-col md:flex-row min-h-0 max-[767px]:space-y-2 sm:space-y-2 md:space-x-4 md:space-y-0">
        <Preview title="K-space (log magnitude)" className="flex-1 flex flex-col" bodyClassName="flex-1 flex items-center justify-center">
          {processing && <div className="p-4"><Spinner /></div>}
          {!processing && kspaceUrl && (
            <img src={kspaceUrl} alt="K-space" className="max-w-full max-h-full object-contain" />
          )}
        </Preview>
        <Preview title="Reconstructed Image" className="flex-1 flex flex-col" bodyClassName="flex-1 flex items-center justify-center">
          {processing && <div className="p-4"><Spinner /></div>}
          {!processing && reconUrl && (
            <img src={reconUrl} alt="Reconstructed" className="max-w-full max-h-full object-contain" />
          )}
        </Preview>
      </div>

      {/* Modal for enlarged image preview */}
      <Modal open={previewOpen} onClose={() => setPreviewOpen(false)}>
        {imageUrl && (
          <img src={imageUrl} alt="Preview" className="block max-w-[90vw] max-h-[90vh] object-contain" />
        )}
      </Modal>
    </main>
  )
}

export default App
