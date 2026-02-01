import { useState, useEffect } from 'react'
import './App.css'
import DiningCard from './components/DiningCard'

const MEALS = ['breakfast', 'lunch', 'dinner', 'latenight']

function getMealForTime(date) {
  const hour = date.getHours()
  if (hour >= 6 && hour < 11) return 'breakfast'
  if (hour >= 11 && hour < 15) return 'lunch'
  if (hour >= 15 && hour < 21) return 'dinner'
  return 'latenight'
}

function App() {
  const [menu, setMenu] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [selectedMeal, setSelectedMeal] = useState(() => getMealForTime(new Date()))
  const [lightMode, setLightMode] = useState(false)
  const [now, setNow] = useState(() => new Date())
  const [ratingsByHall, setRatingsByHall] = useState({})
  const [ratingMessage, setRatingMessage] = useState(null)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', lightMode ? 'light' : 'dark')
  }, [lightMode])

  useEffect(() => {
    const tick = () => setNow(new Date())
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    setLoading(true)
    setError(null)
    fetch('/api/menu')
      .then((res) => {
        if (!res.ok) throw new Error(res.statusText)
        return res.json()
      })
      .then(setMenu)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    fetch('/api/ratings/today', { credentials: 'include' })
      .then((res) => {
        if (!res.ok) throw new Error(res.statusText)
        return res.json()
      })
      .then(setRatingsByHall)
      .catch(() => setRatingsByHall({}))
  }, [])

  async function onRate(hallName, rating) {
    const res = await fetch('/api/ratings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ hallName, rating }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      setRatingMessage(data.error || `Could not submit rating (${res.status}).`)
      setTimeout(() => setRatingMessage(null), 4000)
      return
    }
    const { average, count, userRating } = data
    setRatingsByHall((prev) => ({ ...prev, [hallName]: { average, count, userRating } }))
  }

  if (loading) {
    return (
      <div className="app">
        <header className="app-header">
          <h1>Hungry Lion</h1>
          <div className="live-clock">
            <span className="live-clock-date">{now.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</span>
            <span className="live-clock-time">{now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
          </div>
          <label className="theme-switch" aria-label="Toggle light mode">
            <input
              type="checkbox"
              checked={lightMode}
              onChange={(e) => setLightMode(e.target.checked)}
            />
            <span className="theme-switch-slider" />
          </label>
        </header>
        <p>Loading menu…</p>
      </div>
    )
  }
  if (error) {
    return (
      <div className="app">
        <header className="app-header">
          <h1>Hungry Lion</h1>
          <div className="live-clock">
            <span className="live-clock-date">{now.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</span>
            <span className="live-clock-time">{now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
          </div>
          <label className="theme-switch" aria-label="Toggle light mode">
            <input
              type="checkbox"
              checked={lightMode}
              onChange={(e) => setLightMode(e.target.checked)}
            />
            <span className="theme-switch-slider" />
          </label>
        </header>
        <p>Error: {error}</p>
      </div>
    )
  }
  if (!menu) return null

  const mealData = menu[selectedMeal]
  const halls = mealData?.halls ?? []

  return (
    <div className="app">
      <header className="app-header">
        <h1>Hungry Lion</h1>
        <div className="live-clock">
          <span className="live-clock-date">{now.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</span>
          <span className="live-clock-time">{now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
        </div>
        <label className="theme-switch" aria-label="Toggle light mode">
          <input
            type="checkbox"
            checked={lightMode}
            onChange={(e) => setLightMode(e.target.checked)}
          />
          <span className="theme-switch-slider" />
        </label>
      </header>
      {ratingMessage && (
        <p className="rating-message" role="alert">
          {ratingMessage}
        </p>
      )}
      <nav className="meal-tabs">
        {MEALS.map((meal) => (
          <button
            key={meal}
            className={selectedMeal === meal ? 'active' : ''}
            onClick={() => setSelectedMeal(meal)}
          >
            {meal}
          </button>
        ))}
      </nav>
      <DiningCard halls={halls} ratingsByHall={ratingsByHall} onRate={onRate} />
    </div>
  )
}

export default App
