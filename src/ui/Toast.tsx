import { useEffect } from 'react'
import { create } from 'zustand'

type ToastState = { text: string | null; id: number }

const useToastStore = create<ToastState>()(() => ({ text: null, id: 0 }))

export function showToast(text: string) {
  useToastStore.setState((s) => ({ text, id: s.id + 1 }))
}

export function Toast() {
  const { text, id } = useToastStore()
  useEffect(() => {
    if (!text) return
    const t = setTimeout(() => useToastStore.setState({ text: null }), 4500)
    return () => clearTimeout(t)
  }, [text, id])
  if (!text) return null
  return (
    <div className="toast card" role="status" key={id}>
      {text}
    </div>
  )
}
