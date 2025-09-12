import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertTriangle, Wand2, RefreshCw, Car, Calendar, Plus, Edit3 } from 'lucide-react';
import type { Show, Assignment, Role, CastMember, DayStatus } from '~backend/scheduler/types';
import { formatTime, formatDate } from '../utils/dateUtils';

interface ScheduleGridProps {
  shows: Show[];
  assignments: Assignment[];
  castMembers: CastMember[];
  roles: Role[];
  location: string;
  onAssignmentChange: (showId: string, role: Role, performer: string) => void;
  onShowStatusChange: (showId: string, status: DayStatus) => void;
  onShowChange: (showId: string, field: 'date' | 'time' | 'callTime', value: string) => void;
  onAddShow: () => void;
  onRemoveShow: (showId: string) => void;
  onClearAll: () => void;
  onAutoGenerate: () => void;
  isGenerating: boolean;
  onSave?: () => void;
  isSaving?: boolean;
  isEditing?: boolean;
}

export function ScheduleGrid({
  shows,
  assignments,
  castMembers,
  roles,
  location,
  onAssignmentChange,
  onShowStatusChange,
  onShowChange,
  onAddShow,
  onRemoveShow,
  onClearAll,
  onAutoGenerate,
  isGenerating,
  onSave,
  isSaving = false,
  isEditing = false
}: ScheduleGridProps) {
  const [editingCell, setEditingCell] = useState<string | null>(null);

  // Filter out removed shows (we'll use status management instead of actual removal)
  const visibleShows = shows.filter(show => show.status !== 'removed');

  // Group assignments by show and role for easy lookup
  const assignmentMap = new Map<string, string>();
  assignments.forEach(assignment => {
    const key = `${assignment.showId}-${assignment.role}`;
    assignmentMap.set(key, assignment.performer);
  });

  // Get assignment for a specific show/role
  const getAssignment = (showId: string, role: Role): string => {
    return assignmentMap.get(`${showId}-${role}`) || '';
  };

  // Get eligible cast members for a role
  const getEligibleCast = (role: Role): CastMember[] => {
    return castMembers.filter(member => member.eligibleRoles.includes(role));
  };

  // Check for conflicts (same performer assigned multiple roles in same show)
  const getShowConflicts = (showId: string): string[] => {
    const showAssignments = assignments.filter(a => a.showId === showId);
    const performers = showAssignments.map(a => a.performer);
    const duplicates = performers.filter((performer, index) => 
      performer && performers.indexOf(performer) !== index
    );
    return [...new Set(duplicates)];
  };

  // Get performers who are OFF for each show
  const getOffPerformers = (showId: string): string[] => {
    const show = visibleShows.find(s => s.id === showId);
    if (show && show.status !== 'show') {
      return []; // No OFF list for travel/day off days
    }

    const assignedPerformers = new Set(
      assignments
        .filter(a => a.showId === showId)
        .map(a => a.performer)
        .filter(Boolean)
    );
    
    return castMembers
      .map(member => member.name)
      .filter(name => !assignedPerformers.has(name));
  };

  // Check if a performer/role combination has conflicts
  const hasConflict = (showId: string, role: Role, performer: string): boolean => {
    if (!performer) return false;
    const conflicts = getShowConflicts(showId);
    return conflicts.includes(performer);
  };

  // Get week number from first show
  const getWeekFromShows = (): string => {
    if (visibleShows.length === 0) return '';
    
    try {
      const firstShowDate = new Date(visibleShows[0].date);
      const startOfYear = new Date(firstShowDate.getFullYear(), 0, 1);
      const pastDaysOfYear = (firstShowDate.getTime() - startOfYear.getTime()) / 86400000;
      const weekNumber = Math.ceil((pastDaysOfYear + startOfYear.getDay() + 1) / 7);
      return weekNumber.toString();
    } catch (error) {
      return '';
    }
  };

  // Handle day status change with confirmation and removal
  const handleDayStatusChange = (showId: string, newStatus: string) => {
    const show = visibleShows.find(s => s.id === showId);
    if (!show) return;

    // Handle removal
    if (newStatus === 'remove') {
      if (confirm('Are you sure you want to remove this day from the schedule?')) {
        onRemoveShow(showId);
      }
      return;
    }

    const hasAssignments = assignments.some(a => a.showId === showId);
    
    if (show.status === 'show' && newStatus !== 'show' && hasAssignments) {
      if (confirm('This will clear all cast assignments for this day. Continue?')) {
        onShowStatusChange(showId, newStatus as DayStatus);
      }
    } else {
      onShowStatusChange(showId, newStatus as DayStatus);
    }
  };

  // Handle editing inline
  const handleStartEdit = (cellId: string) => {
    setEditingCell(cellId);
  };

  const handleSaveEdit = (showId: string, field: 'date' | 'time' | 'callTime', value: string) => {
    onShowChange(showId, field, value);
    setEditingCell(null);
  };

  const handleCancelEdit = () => {
    setEditingCell(null);
  };

  // Render editable cell
  const renderEditableCell = (showId: string, field: 'date' | 'time' | 'callTime', value: string, displayValue: string) => {
    const cellId = `${showId}-${field}`;
    const isEditing = editingCell === cellId;

    if (isEditing) {
      return (
        <div className="flex items-center space-x-1">
          {field === 'callTime' ? (
            <Select
              defaultValue={value === 'TBC' ? 'TBC' : value}
              onValueChange={(newValue) => {
                if (newValue === 'TBC') {
                  handleSaveEdit(showId, field, 'TBC');
                } else if (newValue === 'custom') {
                  // Stay in editing mode for custom time input
                  return;
                } else {
                  handleSaveEdit(showId, field, newValue);
                }
              }}
            >
              <SelectTrigger className="text-xs h-6 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="TBC">TBC</SelectItem>
                <SelectItem value="custom">Custom Time</SelectItem>
                <SelectItem value="14:00">2:00 PM</SelectItem>
                <SelectItem value="14:30">2:30 PM</SelectItem>
                <SelectItem value="15:00">3:00 PM</SelectItem>
                <SelectItem value="18:00">6:00 PM</SelectItem>
                <SelectItem value="19:00">7:00 PM</SelectItem>
              </SelectContent>
            </Select>
          ) : (
            <Input
              type={field === 'date' ? 'date' : 'time'}
              defaultValue={value}
              className="text-xs h-6 w-full"
              autoFocus
              onBlur={(e) => handleSaveEdit(showId, field, e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleSaveEdit(showId, field, e.currentTarget.value);
                } else if (e.key === 'Escape') {
                  handleCancelEdit();
                }
              }}
            />
          )}
        </div>
      );
    }

    return (
      <div 
        className="cursor-pointer hover:bg-blue-50 hover:text-blue-700 rounded px-1 py-0.5 transition-colors relative group"
        onClick={() => handleStartEdit(cellId)}
      >
        {displayValue}
        <Edit3 className="h-3 w-3 opacity-0 group-hover:opacity-50 absolute -top-1 -right-1" />
      </div>
    );
  };

  // Render special day content
  const renderSpecialDayContent = (show: Show) => {
    if (show.status === 'travel') {
      return (
        <div className="flex flex-col items-center justify-center h-8 bg-red-50 border border-red-200 rounded text-red-700 font-bold text-xs">
          <Car className="h-3 w-3 mb-1" />
          <span>TRAVEL</span>
        </div>
      );
    } else if (show.status === 'dayoff') {
      return (
        <div className="flex flex-col items-center justify-center h-8 bg-gray-100 border border-gray-300 rounded text-gray-600 font-bold text-xs">
          <Calendar className="h-3 w-3 mb-1" />
          <span>DAY OFF</span>
        </div>
      );
    }
    return null;
  };

  // Format call time display
  const formatCallTimeDisplay = (callTime: string): string => {
    if (callTime === 'TBC') return 'TBC';
    return formatTime(callTime);
  };

  if (visibleShows.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Cast Schedule</CardTitle>
        </CardHeader>
        <CardContent className="text-center py-8">
          <Calendar className="h-16 w-16 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-500 mb-4">No shows scheduled yet</p>
          <Button onClick={onAddShow}>
            <Plus className="h-4 w-4 mr-2" />
            Add First Show
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Cast Schedule</CardTitle>
          <div className="flex items-center space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={onAutoGenerate}
              disabled={isGenerating || visibleShows.filter(s => s.status === 'show').length === 0}
            >
              {isGenerating ? (
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Wand2 className="h-4 w-4 mr-2" />
              )}
              Auto Generate
            </Button>
            <Button variant="outline" size="sm" onClick={onClearAll}>
              Clear All
            </Button>
            <Button variant="outline" size="sm" onClick={onAddShow}>
              <Plus className="h-4 w-4 mr-2" />
              Add Show
            </Button>
            {onSave && (
              <Button onClick={onSave} disabled={isSaving}>
                {isSaving ? (
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <></>
                )}
                {isEditing ? 'Save Changes' : 'Create Schedule'}
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="w-full overflow-x-auto">
          <div className="min-w-fit">
            {/* Main Header */}
            <div className="text-center font-bold text-lg mb-4">
              STOMP - {location} - Week {getWeekFromShows()}
            </div>
            
            <div className="border-t-2 border-black mb-4"></div>

            {/* Schedule Table */}
            <table className="w-full border-collapse border border-gray-300">
              <thead>
                {/* Row 1: Date Headers */}
                <tr>
                  <th className="border border-gray-300 p-2 bg-gray-50 w-24 text-left font-medium"></th>
                  {visibleShows.map((show) => (
                    <th key={`date-${show.id}`} className="border border-gray-300 p-2 bg-gray-50 text-center font-medium min-w-24">
                      {renderEditableCell(
                        show.id, 
                        'date', 
                        show.date,
                        formatDate(show.date)
                      )}
                    </th>
                  ))}
                </tr>

                {/* Row 2: Status Dropdowns */}
                <tr>
                  <th className="border border-gray-300 p-2 bg-gray-50 text-left font-medium text-sm">Status</th>
                  {visibleShows.map((show) => (
                    <th key={`status-${show.id}`} className="border border-gray-300 p-1 bg-gray-50">
                      <Select
                        value={show.status}
                        onValueChange={(value) => handleDayStatusChange(show.id, value)}
                      >
                        <SelectTrigger className="text-xs h-7 w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="show">Show</SelectItem>
                          <SelectItem value="travel">Travel Day</SelectItem>
                          <SelectItem value="dayoff">Day Off</SelectItem>
                          <SelectItem value="remove">Remove Day</SelectItem>
                        </SelectContent>
                      </Select>
                    </th>
                  ))}
                </tr>

                {/* Row 3: Show Times */}
                <tr>
                  <th className="border border-gray-300 p-2 bg-gray-50 text-left font-medium text-sm">Show</th>
                  {visibleShows.map((show) => (
                    <th key={`show-${show.id}`} className="border border-gray-300 p-2 bg-gray-50 text-center text-xs font-medium">
                      {show.status === 'show' ? renderEditableCell(
                        show.id,
                        'time',
                        show.time,
                        formatTime(show.time)
                      ) : '-'}
                    </th>
                  ))}
                </tr>

                {/* Row 4: Call Times */}
                <tr>
                  <th className="border border-gray-300 p-2 bg-gray-50 text-left font-medium text-sm">Call</th>
                  {visibleShows.map((show) => (
                    <th key={`call-${show.id}`} className="border border-gray-300 p-2 bg-gray-50 text-center text-xs text-gray-600">
                      {show.status === 'show' ? renderEditableCell(
                        show.id,
                        'callTime',
                        show.callTime,
                        formatCallTimeDisplay(show.callTime)
                      ) : '-'}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {/* Separator Row */}
                <tr>
                  <td colSpan={visibleShows.length + 1} className="border-t-2 border-black h-1 p-0"></td>
                </tr>

                {/* Role Assignment Rows */}
                {roles.map((role) => (
                  <tr key={role}>
                    <td className="border border-gray-300 p-2 bg-gray-50 font-medium text-sm">
                      {role}
                    </td>
                    {visibleShows.map((show) => {
                      if (show.status !== 'show') {
                        return (
                          <td key={`${role}-${show.id}`} className="border border-gray-300 p-1 text-center">
                            {renderSpecialDayContent(show)}
                          </td>
                        );
                      }

                      const currentAssignment = getAssignment(show.id, role);
                      const hasError = hasConflict(show.id, role, currentAssignment);
                      const eligibleCast = getEligibleCast(role);
                      
                      return (
                        <td key={`${role}-${show.id}`} className="border border-gray-300 p-1">
                          <Select
                            value={currentAssignment || "none"}
                            onValueChange={(value) => onAssignmentChange(show.id, role, value === "none" ? "" : value)}
                          >
                            <SelectTrigger 
                              className={`text-xs h-8 w-full ${hasError ? 'border-red-500 bg-red-50' : ''}`}
                            >
                              <SelectValue placeholder="Select..." />
                              {hasError && (
                                <AlertTriangle className="h-3 w-3 text-red-500 ml-1 flex-shrink-0" />
                              )}
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">None</SelectItem>
                              {eligibleCast.map((member) => (
                                <SelectItem key={member.name} value={member.name}>
                                  {member.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                      );
                    })}
                  </tr>
                ))}

                {/* Separator Row for OFF Section */}
                {assignments.length > 0 && (
                  <tr>
                    <td colSpan={visibleShows.length + 1} className="border-t-2 border-black h-1 p-0"></td>
                  </tr>
                )}

                {/* OFF Section - Only show if there are assignments */}
                {assignments.length > 0 && (() => {
                  const activeShows = visibleShows.filter(show => show.status === 'show');
                  const maxOffCount = Math.max(...activeShows.map(show => getOffPerformers(show.id).length), 1);
                  
                  return Array.from({ length: maxOffCount }, (_, index) => (
                    <tr key={`off-row-${index}`}>
                      <td className="border border-gray-300 p-2 bg-gray-50 font-medium text-sm">
                        {index === 0 ? 'OFF' : ''}
                      </td>
                      {visibleShows.map((show) => {
                        if (show.status !== 'show') {
                          return (
                            <td key={`off-${show.id}-${index}`} className="border border-gray-300 p-2 text-center">
                              <div className="text-xs bg-gray-100 rounded h-6 flex items-center justify-center">
                                <span className="text-gray-500 italic">N/A</span>
                              </div>
                            </td>
                          );
                        }

                        const offPerformers = getOffPerformers(show.id);
                        const performer = offPerformers[index] || '';
                        
                        return (
                          <td key={`off-${show.id}-${index}`} className="border border-gray-300 p-2 text-center">
                            <div className="text-xs bg-gray-50 rounded h-6 flex items-center justify-center">
                              <span className="text-gray-700">{performer}</span>
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ));
                })()}
              </tbody>
            </table>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
