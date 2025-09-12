import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Calendar, MapPin, Edit, Trash2, Plus } from 'lucide-react';
import backend from '~backend/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/use-toast';
import { formatDate, formatTime } from '../utils/dateUtils';

export default function ScheduleList() {
  const { toast } = useToast();

  const { data: schedulesData, isLoading, error, refetch } = useQuery({
    queryKey: ['schedules'],
    queryFn: () => backend.scheduler.list()
  });

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this schedule?')) {
      return;
    }

    try {
      await backend.scheduler.deleteSchedule({ id });
      toast({
        title: "Success",
        description: "Schedule deleted successfully"
      });
      refetch();
    } catch (error) {
      console.error('Failed to delete schedule:', error);
      toast({
        title: "Error",
        description: "Failed to delete schedule",
        variant: "destructive"
      });
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <div className="text-center">
          <div className="animate-spin h-8 w-8 border-2 border-blue-600 border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-gray-600">Loading schedules...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-red-600 mb-4">Failed to load schedules</p>
        <Button onClick={() => refetch()}>Retry</Button>
      </div>
    );
  }

  const schedules = schedulesData?.schedules || [];

  if (schedules.length === 0) {
    return (
      <div className="text-center py-12">
        <Calendar className="h-16 w-16 text-gray-400 mx-auto mb-4" />
        <h2 className="text-2xl font-semibold text-gray-900 mb-2">No Schedules Yet</h2>
        <p className="text-gray-600 mb-6">Create your first STOMP performance schedule to get started.</p>
        <Button asChild size="lg">
          <Link to="/schedule/new" className="flex items-center space-x-2">
            <Plus className="h-5 w-5" />
            <span>Create First Schedule</span>
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Performance Schedules</h1>
          <p className="text-gray-600">Manage your STOMP theater performance schedules</p>
        </div>
        <Button asChild>
          <Link to="/schedule/new" className="flex items-center space-x-2">
            <Plus className="h-4 w-4" />
            <span>New Schedule</span>
          </Link>
        </Button>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {schedules.map((schedule) => (
          <Card key={schedule.id} className="hover:shadow-md transition-shadow">
            <CardHeader>
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle className="text-lg">{schedule.location}</CardTitle>
                  <p className="text-sm text-gray-600">Week {schedule.week}</p>
                </div>
                <Badge variant="secondary">{schedule.shows.length} shows</Badge>
              </div>
            </CardHeader>
            
            <CardContent>
              <div className="space-y-3">
                <div className="flex items-center space-x-2 text-sm text-gray-600">
                  <MapPin className="h-4 w-4" />
                  <span>{schedule.location}</span>
                </div>
                
                <div className="flex items-center space-x-2 text-sm text-gray-600">
                  <Calendar className="h-4 w-4" />
                  <span>
                    {schedule.shows.length > 0 ? (
                      `${formatDate(schedule.shows[0].date)} - ${formatDate(schedule.shows[schedule.shows.length - 1].date)}`
                    ) : (
                      'No shows scheduled'
                    )}
                  </span>
                </div>

                <div className="text-xs text-gray-500">
                  Created {formatDate(schedule.createdAt instanceof Date ? schedule.createdAt.toISOString() : schedule.createdAt)}
                </div>

                <div className="flex space-x-2 pt-2">
                  <Button asChild size="sm" className="flex-1">
                    <Link to={`/schedule/${schedule.id}`} className="flex items-center justify-center space-x-1">
                      <Edit className="h-3 w-3" />
                      <span>Edit</span>
                    </Link>
                  </Button>
                  
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDelete(schedule.id)}
                    className="flex items-center space-x-1 text-red-600 hover:text-red-700 hover:bg-red-50"
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
