export function formatDate(dateString: string): string {
  try {
    const date = new Date(dateString);
    // Handle ISO date strings by adding timezone if needed
    if (dateString.includes('T')) {
      return date.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short', 
        day: 'numeric'
      });
    } else {
      // Handle YYYY-MM-DD format
      const [year, month, day] = dateString.split('-');
      const localDate = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
      return localDate.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric'
      });
    }
  } catch (error) {
    return dateString;
  }
}

export function formatTime(timeString: string): string {
  try {
    // Handle HH:MM format
    const [hours, minutes] = timeString.split(':');
    const date = new Date();
    date.setHours(parseInt(hours), parseInt(minutes));
    
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  } catch (error) {
    return timeString;
  }
}

export function formatDateTime(dateString: string, timeString: string): string {
  return `${formatDate(dateString)} at ${formatTime(timeString)}`;
}
