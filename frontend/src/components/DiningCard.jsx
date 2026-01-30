import HallCard from './HallCard'

export default function DiningCard({ halls = [], ratingsByHall = {}, onRate }) {
  return (
    <div className="halls">
      {halls.map((hall) => (
        <HallCard
          key={hall.name}
          hall={hall}
          todayRating={ratingsByHall[hall.name]}
          onRate={onRate ? (rating) => onRate(hall.name, rating) : undefined}
        />
      ))}
    </div>
  )
}