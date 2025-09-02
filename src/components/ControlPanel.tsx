type Props = {
  onStartSelection: () => void
  isSelecting?: boolean
}

export default function ControlPanel({ onStartSelection, isSelecting = false }: Props) {
  return (
    <div className="rounded-lg border-none bg-[#72757e] p-4 md:p-6 text-sm text-gray-600">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onStartSelection}
          className={`inline-flex items-center rounded-md border px-3 py-1.5 text-sm ${
            isSelecting
              ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
              : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
          }`}
        >
          Select region
        </button>
      </div>
    </div>
  )
}
