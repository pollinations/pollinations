import { ChevronLeft, ChevronRight, Calendar } from "lucide-react";
import { format, startOfWeek, subWeeks, addWeeks } from "date-fns";

export function WeekSelector({ selectedWeek, onChange }) {
  const currentWeekStart = startOfWeek(new Date(), { weekStartsOn: 1 });

  const handlePrev = () => {
    onChange(subWeeks(selectedWeek, 1));
  };

  const handleNext = () => {
    const next = addWeeks(selectedWeek, 1);
    if (next <= currentWeekStart) {
      onChange(next);
    }
  };

  const handleCurrent = () => {
    onChange(currentWeekStart);
  };

  const isCurrentWeek =
    format(selectedWeek, "yyyy-MM-dd") ===
    format(currentWeekStart, "yyyy-MM-dd");

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={handlePrev}
        className="p-2 rounded-lg bg-gray-800 hover:bg-gray-700 transition-colors"
      >
        <ChevronLeft className="w-5 h-5" />
      </button>

      <div className="flex items-center gap-2 px-4 py-2 bg-gray-800 rounded-lg min-w-48 justify-center">
        <Calendar className="w-4 h-4 text-gray-400" />
        <span className="font-medium">
          Week of {format(selectedWeek, "MMM d, yyyy")}
        </span>
      </div>

      <button
        type="button"
        onClick={handleNext}
        disabled={isCurrentWeek}
        className="p-2 rounded-lg bg-gray-800 hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <ChevronRight className="w-5 h-5" />
      </button>

      {!isCurrentWeek && (
        <button
          type="button"
          onClick={handleCurrent}
          className="px-3 py-2 text-sm rounded-lg bg-green-600 hover:bg-green-500 transition-colors"
        >
          Current
        </button>
      )}
    </div>
  );
}
