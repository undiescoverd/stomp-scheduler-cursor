// Export utilities for the STOMP Scheduler
import type { Schedule, Show, Assignment, CastMember, Role } from '~backend/scheduler/types';
import { formatDate, formatTime } from './dateUtils';

// File download utility
export function downloadFile(
  data: string | Uint8Array | ArrayBuffer,
  filename: string,
  mimeType: string
): void {
  try {
    let blob: Blob;
    
    if (typeof data === 'string') {
      blob = new Blob([data], { type: mimeType });
    } else if (data instanceof Uint8Array) {
      blob = new Blob([data as BlobPart], { type: mimeType });
    } else if (data instanceof ArrayBuffer) {
      blob = new Blob([data], { type: mimeType });
    } else {
      throw new Error('Unsupported data type for download');
    }

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    
    // Append to body to ensure it works in all browsers
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    // Clean up the URL object
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error('Download failed:', error);
    throw new Error(`Failed to download file: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// Calendar export utilities
export class CalendarExporter {
  // Generate iCal data for a performer
  static generateICalForPerformer(
    schedule: Schedule,
    performerName: string,
    assignments: Assignment[],
    shows: Show[]
  ): string {
    const performerAssignments = assignments.filter(a => a.performer === performerName);
    const performerShows = shows.filter(show => 
      performerAssignments.some(a => a.showId === show.id && a.role !== 'OFF')
    );

    const icalLines: string[] = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//STOMP Scheduler//Performance Calendar//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      `X-WR-CALNAME:${performerName} - ${schedule.location} ${schedule.week}`,
      'X-WR-TIMEZONE:America/New_York'
    ];

    performerShows.forEach(show => {
      const assignment = performerAssignments.find(a => a.showId === show.id);
      if (!assignment || assignment.role === 'OFF') return;

      const showDate = new Date(show.date);
      const [timeHour, timeMinute] = show.time.split(':').map(Number);
      const [callHour, callMinute] = show.callTime.split(':').map(Number);
      
      const callDateTime = new Date(showDate);
      callDateTime.setHours(callHour, callMinute, 0, 0);
      
      const showDateTime = new Date(showDate);
      showDateTime.setHours(timeHour, timeMinute, 0, 0);
      
      // Estimate show duration (2.5 hours)
      const endDateTime = new Date(showDateTime);
      endDateTime.setHours(showDateTime.getHours() + 2, showDateTime.getMinutes() + 30);

      const uid = `${show.id}-${assignment.role}-${performerName}@stomp-scheduler.local`;
      const dtStamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
      const dtStart = callDateTime.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
      const dtEnd = endDateTime.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

      icalLines.push(
        'BEGIN:VEVENT',
        `UID:${uid}`,
        `DTSTAMP:${dtStamp}`,
        `DTSTART:${dtStart}`,
        `DTEND:${dtEnd}`,
        `SUMMARY:STOMP Performance - ${assignment.role}`,
        `DESCRIPTION:Role: ${assignment.role}\\nCall Time: ${show.callTime}\\nShow Time: ${show.time}\\nLocation: ${schedule.location}${assignment.isRedDay ? '\\nRED DAY' : ''}`,
        `LOCATION:${schedule.location}`,
        assignment.isRedDay ? 'CATEGORIES:RED-DAY,PERFORMANCE' : 'CATEGORIES:PERFORMANCE',
        'STATUS:CONFIRMED',
        'TRANSP:OPAQUE',
        'END:VEVENT'
      );
    });

    icalLines.push('END:VCALENDAR');
    return icalLines.join('\r\n');
  }

  // Generate Google Calendar URL
  static generateGoogleCalendarUrl(
    show: Show,
    assignment: Assignment,
    location: string
  ): string {
    const showDate = new Date(show.date);
    const [timeHour, timeMinute] = show.time.split(':').map(Number);
    const [callHour, callMinute] = show.callTime.split(':').map(Number);
    
    const callDateTime = new Date(showDate);
    callDateTime.setHours(callHour, callMinute, 0, 0);
    
    const showDateTime = new Date(showDate);
    showDateTime.setHours(timeHour, timeMinute, 0, 0);
    
    // Estimate show duration (2.5 hours)
    const endDateTime = new Date(showDateTime);
    endDateTime.setHours(showDateTime.getHours() + 2, showDateTime.getMinutes() + 30);

    const formatGoogleDate = (date: Date) => 
      date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

    const params = new URLSearchParams({
      action: 'TEMPLATE',
      text: `STOMP Performance - ${assignment.role}`,
      dates: `${formatGoogleDate(callDateTime)}/${formatGoogleDate(endDateTime)}`,
      details: `Role: ${assignment.role}\nCall Time: ${show.callTime}\nShow Time: ${show.time}\nLocation: ${location}${assignment.isRedDay ? '\nRED DAY' : ''}`,
      location: location,
      trp: 'false' // Don't show as busy time
    });

    return `https://calendar.google.com/calendar/render?${params.toString()}`;
  }

  // Generate Outlook calendar URL
  static generateOutlookCalendarUrl(
    show: Show,
    assignment: Assignment,
    location: string
  ): string {
    const showDate = new Date(show.date);
    const [timeHour, timeMinute] = show.time.split(':').map(Number);
    const [callHour, callMinute] = show.callTime.split(':').map(Number);
    
    const callDateTime = new Date(showDate);
    callDateTime.setHours(callHour, callMinute, 0, 0);
    
    const showDateTime = new Date(showDate);
    showDateTime.setHours(timeHour, timeMinute, 0, 0);
    
    // Estimate show duration (2.5 hours)
    const endDateTime = new Date(showDateTime);
    endDateTime.setHours(showDateTime.getHours() + 2, showDateTime.getMinutes() + 30);

    const params = new URLSearchParams({
      subject: `STOMP Performance - ${assignment.role}`,
      startdt: callDateTime.toISOString(),
      enddt: endDateTime.toISOString(),
      body: `Role: ${assignment.role}\nCall Time: ${show.callTime}\nShow Time: ${show.time}\nLocation: ${location}${assignment.isRedDay ? '\nRED DAY' : ''}`,
      location: location
    });

    return `https://outlook.live.com/calendar/0/deeplink/compose?${params.toString()}`;
  }
}

// CSV export utilities
export class CSVExporter {
  static generateScheduleCSV(
    schedule: Schedule,
    assignments: Assignment[],
    castMembers: CastMember[]
  ): string {
    const headers = [
      'Date',
      'Time', 
      'Call Time',
      'Status',
      'Performer',
      'Role',
      'RED Day'
    ];

    const rows: string[][] = [headers];

    schedule.shows.forEach(show => {
      const showAssignments = assignments.filter(a => a.showId === show.id);
      
      if (showAssignments.length === 0) {
        rows.push([
          formatDate(show.date),
          show.time,
          show.callTime,
          show.status,
          '',
          '',
          ''
        ]);
      } else {
        showAssignments.forEach(assignment => {
          rows.push([
            formatDate(show.date),
            show.time,
            show.callTime,
            show.status,
            assignment.performer,
            assignment.role,
            assignment.isRedDay ? 'Yes' : 'No'
          ]);
        });
      }
    });

    return rows.map(row => 
      row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')
    ).join('\n');
  }

  static generatePerformerUtilizationCSV(
    performerUtilization: Array<{
      performer: string;
      totalShows: number;
      performingShows: number;
      utilizationRate: number;
      redDays: number;
      roles: string[];
    }>
  ): string {
    const headers = [
      'Performer',
      'Total Shows',
      'Performing Shows', 
      'Utilization Rate (%)',
      'RED Days',
      'Roles'
    ];

    const rows: string[][] = [headers];

    performerUtilization.forEach(util => {
      rows.push([
        util.performer,
        util.totalShows.toString(),
        util.performingShows.toString(),
        util.utilizationRate.toFixed(1),
        util.redDays.toString(),
        util.roles.join(', ')
      ]);
    });

    return rows.map(row => 
      row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')
    ).join('\n');
  }
}

// JSON export utilities
export class JSONExporter {
  static generateScheduleJSON(
    schedule: Schedule,
    assignments: Assignment[],
    castMembers: CastMember[]
  ): string {
    const exportData = {
      schedule: {
        ...schedule,
        createdAt: schedule.createdAt.toISOString(),
        updatedAt: schedule.updatedAt.toISOString()
      },
      assignments,
      castMembers,
      exportMetadata: {
        exportedAt: new Date().toISOString(),
        version: '1.0',
        format: 'STOMP-Scheduler-JSON'
      }
    };

    return JSON.stringify(exportData, null, 2);
  }
}

// Export format detection
export function detectFileFormat(filename: string): 'csv' | 'json' | 'ical' | 'pdf' | 'xlsx' | 'unknown' {
  const extension = filename.toLowerCase().split('.').pop();
  
  switch (extension) {
    case 'csv': return 'csv';
    case 'json': return 'json';
    case 'ics': 
    case 'ical': return 'ical';
    case 'pdf': return 'pdf';
    case 'xlsx':
    case 'xls': return 'xlsx';
    default: return 'unknown';
  }
}

// MIME type mapping
export const MIME_TYPES = {
  csv: 'text/csv',
  json: 'application/json',
  ical: 'text/calendar',
  pdf: 'application/pdf',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  txt: 'text/plain'
} as const;

// Generate filename with timestamp
export function generateFileName(
  baseName: string,
  extension: string,
  includeTimestamp: boolean = true
): string {
  const sanitizedBaseName = baseName.replace(/[^a-z0-9]/gi, '_');
  const timestamp = includeTimestamp 
    ? `_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}`
    : '';
  
  return `${sanitizedBaseName}${timestamp}.${extension}`;
}