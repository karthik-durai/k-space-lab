import React from 'react'

type Props = {
  onSelect: (file: File) => void
}

export default function ImagePicker({ onSelect }: Props) {
  const onChange: React.ChangeEventHandler<HTMLInputElement> = (e) => {
    const file = e.target.files?.[0]
    if (file) onSelect(file)
  }

  return (
    <div className="mt-4">
      <label htmlFor="image-input" className="block text-sm font-medium text-gray-700">
        Select an image
      </label>
      <input
        id="image-input"
        type="file"
        accept="image/*"
        onChange={onChange}
        className="mt-2 block w-full text-sm text-gray-900 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
      />
    </div>
  )
}

