import '@fontsource-variable/inter'
import '@fontsource-variable/inter-tight'
import { Component, StrictMode, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { STORAGE_KEY, UI_STORAGE_KEY } from './store/persist'

function resetAndReload() {
  try {
    localStorage.removeItem(STORAGE_KEY)
    localStorage.removeItem(UI_STORAGE_KEY)
  } catch {
    /* storage unavailable: reload still starts from the seed */
  }
  location.reload()
}

/** Last-resort screen: the in-app reset lives inside the app, so a render crash needs its own way back. */
class CrashFallback extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  override render() {
    if (!this.state.failed) return this.props.children
    return (
      <div role="alert" className="mx-auto mt-24 max-w-md rounded-card border border-line bg-surface p-6 text-center text-sm text-body">
        <h1 className="font-display text-lg font-semibold text-ink">Демо не удалось открыть</h1>
        <p className="mt-2">Сохраненные в браузере данные прототипа не читаются. Сброс вернет исходное демо.</p>
        <button
          type="button"
          onClick={resetAndReload}
          className="mt-4 inline-flex h-9 items-center rounded-full border border-signal-edge bg-signal px-4 font-medium text-ink hover:bg-[#2f9be8]"
        >
          Сбросить демо
        </button>
      </div>
    )
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <CrashFallback>
      <App />
    </CrashFallback>
  </StrictMode>,
)
