import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Trash2, AlertTriangle, Wand2, RefreshCw, Car, Calendar, Plus, X, Edit3 } from 'lucide-react';
import type { Show, Assignment, Role, CastMember, DayStatus } from '~backend/scheduler/types';
import { formatTime, formatDate } from '../utils/dateUtils';

interface ScheduleGridProps {
  shows: Show[];
  assignments: Assignment[];
  castMembers: CastMember[];
  roles: Role[];
  onAssignmentChange: (showId: string, role: Role, performer: string) => void;
  onShowStatusChange: (showId: string, status: DayStatus) => void;
  onShowChange: (showId: string, field: 'date' | 'time' | 'callTime', value: string) => void;
  onAddShow: () => void;
  onRemoveShow: (showId: string) => void;
  onClearAll: () => void;
  onAutoGenerate: () => void;
  isGenerating: boolean;
}

export function ScheduleGrid({
  shows,
  assignments,
  castMembers,
  roles,
  onAssignmentChange,
  onShowStatusChange,
  onShowChange,
  onAddShow,
  onRemoveShow,
  onClearAll,
  onAutoGenerate,
  isGenerating
}: ScheduleGridProps) {
  const [editingCell, setEditingCell] = useState<string | null>(null);

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
    const show = shows.find(s => s.id === showId);
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
    if (shows.length === 0) return '';
    
    try {
      const firstShowDate = new Date(shows[0].date);
      const startOfYear = new Date(firstShowDate.getFullYear(), 0, 1);
      const pastDaysOfYear = (firstShowDate.getTime() - startOfYear.getTime()) / 86400000;
      const weekNumber = Math.ceil((pastDaysOfYear + startOfYear.getDay() + 1) / 7);
      return weekNumber.toString();
    } catch (error) {
      return '';
    }
  };

  // Get day status options
  const getDayStatusOptions = () => [
    { value: 'show', label: 'Show', icon: '🎭' },
    { value: 'travel', label: 'Travel', icon: '🚗' },
    { value: 'dayoff', label: 'Day Off', icon: '🏠' }
  ];

  // Handle day status change with confirmation
  const handleDayStatusChange = (showId: string, newStatus: DayStatus) => {
    const show = shows.find(s => s.id === showId);
    if (!show) return;

    const hasAssignments = assignments.some(a => a.showId === showId);
    
    if (show.status === 'show' && newStatus !== 'show' && hasAssignments) {
      if (confirm('This will clear all cast assignments for this day. Continue?')) {
        onShowStatusChange(showId, newStatus);
      }
    } else {
      onShowStatusChange(showId, newStatus);
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

  if (shows.length === 0) {
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
              disabled={isGenerating || shows.filter(s => s.status === 'show').length === 0}
            >
              {isGenerating ? (
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Wand2 className="h-4 w-4 mr-2" />
              )}
              Auto Generate
            </Button>
            <Button variant="outline" size="sm" onClick={onClearAll}>
              <Trash2 className="h-4 w-4 mr-2" />
              Clear All
            </Button>
            <Button variant="outline" size="sm" onClick={onAddShow}>
              <Plus className="h-4 w-4 mr-2" />
              Add Show
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="w-full overflow-x-auto">
          <div className="min-w-fit">
            {/* Header Section */}
            <div className="mb-4">
              <div className="bg-gray-50 p-4 rounded-lg">
                <div className="text-center">
                  <div className="font-bold text-lg mb-4">STOMP - Week {getWeekFromShows()}</div>
                  <div className="h-px bg-gray-300 mb-4"></div>
                  
                  {/* Main Grid Container - Full Width */}
                  <div className="grid gap-3 w-full" style={{ gridTemplateColumns: `120px repeat(${shows.length}, 1fr) 60px` }}>
                    {/* Empty cell for role column */}
                    <div></div>
                    
                    {/* Date Headers - Editable */}
                    {shows.map((show) => (
                      <div key={`date-${show.id}`} className="text-sm font-medium text-center">
                        {renderEditableCell(
                          show.id, 
                          'date', 
                          show.date,
                          new Date(show.date).toLocaleDateString('en-US', { 
                            weekday: 'short', 
                            month: 'numeric', 
                            day: 'numeric' 
                          })
                        )}
                      </div>
                    ))}

                    {/* Add/Remove Column */}
                    <div></div>
                    
                    {/* Day Status Controls */}
                    <div className="font-medium text-sm text-left flex items-center">Status</div>
                    {shows.map((show) => (
                      <div key={`status-${show.id}`} className="flex justify-center">
                        <Select
                          value={show.status}
                          onValueChange={(value: DayStatus) => handleDayStatusChange(show.id, value)}
                        >
                          <SelectTrigger className="text-xs h-7 w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="show">
                              <span className="flex items-center space-x-2">
                                <span>Show</span>
                              </span>
                            </SelectItem>
                            <SelectItem value="travel">
                              <span className="flex items-center space-x-2">
                                <span>Travel</span>
                              </span>
                            </SelectItem>
                            <SelectItem value="dayoff">
                              <span className="flex items-center space-x-2">
                                <span>Day Off</span>
                              </span>
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    ))}

                    {/* Remove Show Buttons */}
                    <div className="text-xs text-gray-500">Remove</div>
                    
                    {/* Show Times Label */}
                    <div className="font-medium text-sm text-left flex items-center">Show</div>
                    {/* Show Times - Editable */}
                    {shows.map((show) => (
                      <div key={`show-${show.id}`} className="text-xs font-medium text-center">
                        {show.status === 'show' ? renderEditableCell(
                          show.id,
                          'time',
                          show.time,
                          formatTime(show.time)
                        ) : '-'}
                      </div>
                    ))}

                    {/* Remove Show Buttons */}
                    {shows.map((show) => (
                      <div key={`remove-${show.id}`} className="flex justify-center">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onRemoveShow(show.id)}
                          className="h-6 w-6 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                    
                    {/* Call Times Label */}
                    <div className="font-medium text-sm text-left flex items-center">Call</div>
                    {/* Call Times - Editable */}
                    {shows.map((show) => (
                      <div key={`call-${show.id}`} className="text-xs text-gray-600 text-center">
                        {show.status === 'show' ? renderEditableCell(
                          show.id,
                          'callTime',
                          show.callTime,
                          formatCallTimeDisplay(show.callTime)
                        ) : '-'}
                      </div>
                    ))}

                    {/* Empty cell for alignment */}
                    <div></div>
                  </div>
                  
                  <div className="h-px bg-gray-300 mt-4"></div>
                </div>
              </div>
            </div>

            {/* Role Assignment Grid - Full Width */}
            <div className="space-y-2">
              {roles.map((role) => (
                <div key={role} className="grid gap-3 w-full" style={{ gridTemplateColumns: `120px repeat(${shows.length}, 1fr) 60px` }}>
                  {/* Role Label */}
                  <div className="flex items-center font-medium text-sm py-2 px-3 bg-gray-50 rounded">
                    <span className="truncate">{role}</span>
                  </div>
                  
                  {/* Assignment Dropdowns or Special Day Content */}
                  {shows.map((show) => {
                    if (show.status !== 'show') {
                      return (
                        <div key={`${role}-${show.id}`} className="flex justify-center">
                          {renderSpecialDayContent(show)}
                        </div>
                      );
                    }

                    const currentAssignment = getAssignment(show.id, role);
                    const hasError = hasConflict(show.id, role, currentAssignment);
                    const eligibleCast = getEligibleCast(role);
                    
                    return (
                      <div key={`${role}-${show.id}`} className="flex justify-center">
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
                      </div>
                    );
                  })}

                  {/* Empty cell for alignment */}
                  <div></div>
                </div>
              ))}
            </div>

            {/* Separator */}
            <div className="my-6">
              <div className="h-px bg-gray-300"></div>
            </div>

            {/* OFF Section - Only show if there are assignments */}
            {assignments.length > 0 && (
              <div className="space-y-2">
                {/* Calculate max OFF performers needed */}
                {(() => {
                  const activeShows = shows.filter(show => show.status === 'show');
                  const maxOffCount = Math.max(...activeShows.map(show => getOffPerformers(show.id).length), 1);
                  
                  return Array.from({ length: maxOffCount }, (_, index) => (
                    <div key={`off-row-${index}`} className="grid gap-3 w-full" style={{ gridTemplateColumns: `120px repeat(${shows.length}, 1fr) 60px` }}>
                      {/* OFF Label - only show on first row */}
                      <div className="flex items-center font-medium text-sm py-2 px-3 bg-gray-50 rounded">
                        <span>{index === 0 ? 'OFF' : ''}</span>
                      </div>
                      
                      {/* OFF Performers per show */}
                      {shows.map((show) => {
                        if (show.status !== 'show') {
                          return (
                            <div key={`off-${show.id}-${index}`} className="text-xs p-2 bg-gray-100 rounded h-8 text-center flex items-center justify-center">
                              <span className="text-gray-500 italic">N/A</span>
                            </div>
                          );
                        }

                        const offPerformers = getOffPerformers(show.id);
                        const performer = offPerformers[index] || '';
                        
                        return (
                          <div key={`off-${show.id}-${index}`} className="text-xs p-2 bg-gray-50 rounded h-8 text-center flex items-center justify-center">
                            <span className="text-gray-700">{performer}</span>
                          </div>
                        );
                      })}

                      {/* Empty cell for alignment */}
                      <div></div>
                    </div>
                  ));
                })()}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
