export default function HallCard({ hall, todayRating, onRate }) {
  const hasRating = todayRating && todayRating.count > 0
  return (
    <section className="hall-card">
      <h2 className="hall-name">{hall.name}</h2>
      <div className="hall-rating-row">
        <span className="hall-rating-label">Daily Rating</span>
        <span className={hasRating ? 'hall-rating-average' : 'hall-rating-empty'}>
          {hasRating ? `${todayRating.average} ★ (${todayRating.count})` : '0 ★ (0)'}
        </span>
        {onRate && (
          <div className="star-rating" role="group" aria-label="Rate this hall">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                className={`star-rating-btn ${todayRating?.userRating != null && n <= todayRating.userRating ? 'star-rating-btn--filled' : ''}`}
                aria-label={`${n} star${n > 1 ? 's' : ''}`}
                aria-pressed={todayRating?.userRating === n}
                onClick={() => onRate(n)}
              >
                ★
              </button>
            ))}
          </div>
        )}
      </div>
      {hall.hours && <p className="hours">{hall.hours}</p>}
      <div className="stations">
        {hall.stations.map((station) => (
          <div key={station.name} className="station">
            <h3>{station.name}</h3>
            <ul>
              {station.items.map((item, i) => (
                <li key={`${station.name}-${i}-${item}`}>{item}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  )
}
