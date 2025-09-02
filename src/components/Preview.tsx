import React from 'react'

type Props = {
  title: string
  children: React.ReactNode
  className?: string
  bodyClassName?: string
}

export default function Preview({ title, children, className = '', bodyClassName = '' }: Props) {
  return (
    <figure className={`m-0 ${className}`}>
      <figcaption className="mb-2 text-sm text-gray-600">{title}</figcaption>
      <div className={`rounded-lg overflow-hidden border  ${bodyClassName}`}>
        {children}
      </div>
    </figure>
  )
}
