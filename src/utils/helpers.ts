export function formatHours(hours: number): string {
  if (!hours) return '0h';
  const hrs = Math.floor(hours);
  const mins = Math.round((hours - hrs) * 60);
  return `${hrs}h ${mins}m`;
}

export function formatDate(timestamp: any): string {
  if (!timestamp) return '-';
  
  let date: Date;
  if (typeof timestamp.toDate === 'function') {
    date = timestamp.toDate();
  } else if (timestamp instanceof Date) {
    date = timestamp;
  } else {
    date = new Date(timestamp);
  }

  return date.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });
}

export function formatTime(timestamp: any): string {
  if (!timestamp) return '-';
  
  let date: Date;
  if (typeof timestamp.toDate === 'function') {
    date = timestamp.toDate();
  } else if (timestamp instanceof Date) {
    date = timestamp;
  } else {
    date = new Date(timestamp);
  }

  return date.toLocaleTimeString('en-IN', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
}

export function getStatusColor(status: string): string {
  switch (status?.toLowerCase()) {
    case 'present':
    case 'checked in':
      return '#10B981'; // emerald
    case 'late':
      return '#EF4444'; // red
    case 'absent':
    case 'not checked in':
      return '#EF4444'; // red
    case 'leave':
    case 'approved':
      return '#10B981';
    case 'checked out':
    case 'pending':
      return '#3B82F6'; // blue
    case 'rejected':
      return '#EF4444';
    case 'online':
      return '#10B981';
    case 'offline':
      return '#6B7280';
    default:
      return '#6B7280';
  }
}
