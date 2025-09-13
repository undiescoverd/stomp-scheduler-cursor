import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/use-toast';
import { Users, Archive, Edit3, ArrowUp, Search, UserPlus, GripVertical, Trash2, Filter } from 'lucide-react';
import backend from '~backend/client';
import type { CompanyMember, Role } from '~backend/scheduler/company';
import { RoleSelector } from './RoleSelector';

export default function CompanyManagement() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<Role | 'all'>('all');
  const [editingMember, setEditingMember] = useState<string | null>(null);
  const [newMemberName, setNewMemberName] = useState('');
  const [newMemberRoles, setNewMemberRoles] = useState<Role[]>([]);
  const [showAddCurrentForm, setShowAddCurrentForm] = useState(false);
  const [showAddArchiveForm, setShowAddArchiveForm] = useState(false);

  // Fetch company data
  const { data: companyData, isLoading } = useQuery({
    queryKey: ['company'],
    queryFn: () => backend.scheduler.getCompany()
  });

  // Add member mutation
  const addMemberMutation = useMutation({
    mutationFn: (data: { name: string; eligibleRoles: Role[]; status: 'active' | 'archived' }) =>
      backend.scheduler.addMember(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['company'] });
      queryClient.invalidateQueries({ queryKey: ['cast-members'] });
      setNewMemberName('');
      setNewMemberRoles([]);
      setShowAddCurrentForm(false);
      setShowAddArchiveForm(false);
      toast({
        title: "Success",
        description: "Cast member added successfully"
      });
    },
    onError: (error) => {
      console.error('Failed to add member:', error);
      toast({
        title: "Error",
        description: "Failed to add cast member",
        variant: "destructive"
      });
    }
  });

  // Update member mutation
  const updateMemberMutation = useMutation({
    mutationFn: (data: { id: string; name?: string; eligibleRoles?: Role[]; status?: "active" | "archived" }) =>
      backend.scheduler.updateMember(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['company'] });
      queryClient.invalidateQueries({ queryKey: ['cast-members'] });
      setEditingMember(null);
      toast({
        title: "Success",
        description: "Cast member updated successfully"
      });
    },
    onError: (error) => {
      console.error('Failed to update member:', error);
      toast({
        title: "Error",
        description: "Failed to update cast member",
        variant: "destructive"
      });
    }
  });

  // Delete member mutation
  const deleteMemberMutation = useMutation({
    mutationFn: (id: string) => backend.scheduler.deleteMember({ id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['company'] });
      queryClient.invalidateQueries({ queryKey: ['cast-members'] });
      toast({
        title: "Success",
        description: "Cast member deleted permanently"
      });
    },
    onError: (error) => {
      console.error('Failed to delete member:', error);
      toast({
        title: "Error",
        description: "Failed to delete cast member",
        variant: "destructive"
      });
    }
  });

  const handleAddMember = async (status: 'active' | 'archived') => {
    if (!newMemberName.trim() || newMemberRoles.length === 0) {
      toast({
        title: "Validation Error",
        description: "Please enter a name and select at least one role",
        variant: "destructive"
      });
      return;
    }

    try {
      await addMemberMutation.mutateAsync({
        name: newMemberName.trim(),
        eligibleRoles: newMemberRoles,
        status
      });
    } catch (error) {
      // Error handling is done in mutation onError
    }
  };

  const handleArchiveMember = async (member: CompanyMember) => {
    try {
      await updateMemberMutation.mutateAsync({
        id: member.id,
        status: "archived"
      });
    } catch (error) {
      // Error handling is done in mutation onError
    }
  };

  const handleRestoreMember = async (member: CompanyMember) => {
    try {
      await updateMemberMutation.mutateAsync({
        id: member.id,
        status: "active"
      });
    } catch (error) {
      // Error handling is done in mutation onError
    }
  };

  const handleDeleteMember = async (member: CompanyMember) => {
    if (!confirm(`Are you sure you want to permanently delete ${member.name}? This action cannot be undone.`)) {
      return;
    }

    try {
      await deleteMemberMutation.mutateAsync(member.id);
    } catch (error) {
      // Error handling is done in mutation onError
    }
  };

  const handleUpdateRoles = async (member: CompanyMember, roles: Role[]) => {
    try {
      await updateMemberMutation.mutateAsync({
        id: member.id,
        eligibleRoles: roles
      });
    } catch (error) {
      // Error handling is done in mutation onError
    }
  };

  const handleUpdateName = async (member: CompanyMember, name: string) => {
    if (!name.trim()) return;
    
    try {
      await updateMemberMutation.mutateAsync({
        id: member.id,
        name: name.trim()
      });
    } catch (error) {
      // Error handling is done in mutation onError
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <div className="text-center">
          <div className="animate-spin h-8 w-8 border-2 border-blue-600 border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-gray-600">Loading company data...</p>
        </div>
      </div>
    );
  }

  const { currentCompany = [], archive = [], roles = [] } = companyData || {};

  const filterMembers = (members: CompanyMember[]) => {
    return members.filter(member => {
      const matchesSearch = member.name.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesRole = roleFilter === 'all' || member.eligibleRoles.includes(roleFilter);
      return matchesSearch && matchesRole;
    });
  };

  const filteredCurrentCompany = filterMembers(currentCompany);
  const filteredArchive = filterMembers(archive);

  const renderAddMemberForm = (status: 'active' | 'archived') => (
    <Card className="border-dashed border-blue-300 bg-blue-50">
      <CardContent className="p-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <Input
              placeholder="Cast member name"
              value={newMemberName}
              onChange={(e) => setNewMemberName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAddMember(status);
              }}
            />
          </div>
          <div>
            <RoleSelector
              selectedRoles={newMemberRoles}
              availableRoles={roles}
              onChange={setNewMemberRoles}
              placeholder="Select roles..."
            />
          </div>
          <div className="flex items-center space-x-2">
            <Button onClick={() => handleAddMember(status)} disabled={addMemberMutation.isPending}>
              Add Member
            </Button>
            <Button variant="outline" onClick={() => {
              if (status === 'active') setShowAddCurrentForm(false);
              else setShowAddArchiveForm(false);
              setNewMemberName('');
              setNewMemberRoles([]);
            }}>
              Cancel
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6 max-w-full">
      <Card>
        <CardContent className="p-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="relative flex-grow">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search by name..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="flex-grow md:flex-grow-0 md:w-64">
              <Select value={roleFilter} onValueChange={(value) => setRoleFilter(value as Role | 'all')}>
                <SelectTrigger>
                  <Filter className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="Filter by role..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Roles</SelectItem>
                  {roles.map(role => (
                    <SelectItem key={role} value={role}>{role}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="current" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="current" className="flex items-center space-x-2">
            <Users className="h-4 w-4" />
            <span>Current ({filteredCurrentCompany.length})</span>
          </TabsTrigger>
          <TabsTrigger value="archive" className="flex items-center space-x-2">
            <Archive className="h-4 w-4" />
            <span>Archive ({filteredArchive.length})</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="current" className="mt-6">
          <div className="space-y-6">
            {showAddCurrentForm ? renderAddMemberForm('active') : (
              <Button
                variant="dashed"
                className="w-full border-dashed border-2 h-16 text-gray-600 hover:text-gray-900 hover:border-gray-400"
                onClick={() => setShowAddCurrentForm(true)}
              >
                <UserPlus className="h-5 w-5 mr-2" />
                Add Cast Member
              </Button>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredCurrentCompany.length === 0 ? (
                <div className="col-span-full text-center py-8 text-gray-500">
                  {searchTerm || roleFilter !== 'all' ? 'No cast members match your search' : 'No current company members'}
                </div>
              ) : (
                filteredCurrentCompany.map((member) => (
                  <Card key={member.id} className="hover:shadow-md transition-shadow">
                    <CardContent className="p-4">
                      <div className="flex flex-col h-full">
                        <div className="flex items-start space-x-3 flex-1">
                          <GripVertical className="h-4 w-4 text-gray-400 cursor-move mt-1" />
                          <div className="flex-1 space-y-3">
                            {editingMember === member.id ? (
                              <Input
                                defaultValue={member.name}
                                className="font-medium"
                                autoFocus
                                onBlur={(e) => handleUpdateName(member, e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleUpdateName(member, e.currentTarget.value);
                                  else if (e.key === 'Escape') setEditingMember(null);
                                }}
                              />
                            ) : (
                              <div className="font-medium cursor-pointer hover:text-blue-600 flex items-center space-x-2" onClick={() => setEditingMember(member.id)}>
                                <span>{member.name}</span>
                                <Edit3 className="h-3 w-3 opacity-50" />
                              </div>
                            )}
                            <div>
                              <RoleSelector selectedRoles={member.eligibleRoles} availableRoles={roles} onChange={(newRoles) => handleUpdateRoles(member, newRoles)} displayMode="badges" />
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center space-x-2 mt-4 pt-4 border-t">
                          <Button variant="outline" size="sm" className="flex-1" onClick={() => handleArchiveMember(member)}>Archive</Button>
                          <Button variant="destructive" size="icon" onClick={() => handleDeleteMember(member)}><Trash2 className="h-4 w-4" /></Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="archive" className="mt-6">
          <div className="space-y-6">
            {showAddArchiveForm ? renderAddMemberForm('archived') : (
              <Button
                variant="dashed"
                className="w-full border-dashed border-2 h-16 text-gray-600 hover:text-gray-900 hover:border-gray-400"
                onClick={() => setShowAddArchiveForm(true)}
              >
                <UserPlus className="h-5 w-5 mr-2" />
                Add Cast Member to Archive
              </Button>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredArchive.length === 0 ? (
                <div className="col-span-full text-center py-8 text-gray-500">
                  {searchTerm || roleFilter !== 'all' ? 'No archived members match your search' : 'No archived members'}
                </div>
              ) : (
                filteredArchive.map((member) => (
                  <Card key={member.id} className="bg-gray-50 hover:shadow-md transition-shadow">
                    <CardContent className="p-4">
                      <div className="flex flex-col h-full">
                        <div className="flex-1 space-y-3">
                          <div className="flex items-center space-x-3">
                            <span className="font-medium text-gray-700">{member.name}</span>
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {member.eligibleRoles.map((role) => (
                              <Badge key={role} variant="outline" className="text-xs">{role}</Badge>
                            ))}
                          </div>
                          <p className="text-xs text-gray-400">
                            Archived {member.dateArchived ? new Date(member.dateArchived).toLocaleDateString() : 'N/A'}
                          </p>
                        </div>
                        <div className="flex items-center space-x-2 mt-4 pt-4 border-t">
                          <Button variant="outline" size="sm" className="flex-1 text-green-600 hover:text-green-700" onClick={() => handleRestoreMember(member)}>
                            <ArrowUp className="h-3 w-3 mr-1" />
                            Restore
                          </Button>
                          <Button variant="destructive" size="icon" onClick={() => handleDeleteMember(member)}><Trash2 className="h-4 w-4" /></Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
