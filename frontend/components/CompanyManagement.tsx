import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/use-toast';
import { Users, Archive, Plus, Edit3, ArrowUp, X, Search, UserPlus, GripVertical } from 'lucide-react';
import backend from '~backend/client';
import type { CompanyMember, Role } from '~backend/scheduler/company';
import { RoleSelector } from './RoleSelector';

interface CompanyManagementProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CompanyManagement({ isOpen, onClose }: CompanyManagementProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [searchTerm, setSearchTerm] = useState('');
  const [editingMember, setEditingMember] = useState<string | null>(null);
  const [newMemberName, setNewMemberName] = useState('');
  const [newMemberRoles, setNewMemberRoles] = useState<Role[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [archiveFilter, setArchiveFilter] = useState<'all' | 'on_tour' | 'substitute' | 'alumni'>('all');

  // Fetch company data
  const { data: companyData, isLoading } = useQuery({
    queryKey: ['company'],
    queryFn: () => backend.scheduler.getCompany(),
    enabled: isOpen
  });

  // Add member mutation
  const addMemberMutation = useMutation({
    mutationFn: (data: { name: string; eligibleRoles: Role[] }) =>
      backend.scheduler.addMember(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['company'] });
      queryClient.invalidateQueries({ queryKey: ['cast-members'] });
      setNewMemberName('');
      setNewMemberRoles([]);
      setShowAddForm(false);
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
    mutationFn: (data: { id: string; name?: string; eligibleRoles?: Role[]; status?: "active" | "archived"; archiveCategory?: "on_tour" | "substitute" | "alumni"; archiveReason?: string }) =>
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

  const handleAddMember = async () => {
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
        eligibleRoles: newMemberRoles
      });
    } catch (error) {
      // Error handling is done in mutation onError
    }
  };

  const handleArchiveMember = async (member: CompanyMember, category: "on_tour" | "substitute" | "alumni", reason?: string) => {
    try {
      await updateMemberMutation.mutateAsync({
        id: member.id,
        status: "archived",
        archiveCategory: category,
        archiveReason: reason || `Moved to ${category.replace('_', ' ')}`
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

  if (!isOpen) return null;

  if (isLoading) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <Card className="w-full max-w-4xl max-h-[90vh] m-4">
          <CardContent className="p-8 text-center">
            <div className="animate-spin h-8 w-8 border-2 border-blue-600 border-t-transparent rounded-full mx-auto mb-4"></div>
            <p className="text-gray-600">Loading company data...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { currentCompany = [], archive = [], roles = [] } = companyData || {};

  // Filter archive based on selected category
  const filteredArchive = archive.filter(member => {
    const matchesCategory = archiveFilter === 'all' || member.archiveCategory === archiveFilter;
    const matchesSearch = member.name.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  // Filter current company based on search
  const filteredCurrentCompany = currentCompany.filter(member =>
    member.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const archiveCounts = {
    all: archive.length,
    on_tour: archive.filter(m => m.archiveCategory === 'on_tour').length,
    substitute: archive.filter(m => m.archiveCategory === 'substitute').length,
    alumni: archive.filter(m => m.archiveCategory === 'alumni').length
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <Card className="w-full max-w-6xl max-h-[90vh] m-4 flex flex-col">
        <CardHeader className="flex-shrink-0 border-b">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Users className="h-6 w-6 text-blue-600" />
              <div>
                <CardTitle className="text-2xl">Company Management</CardTitle>
                <p className="text-sm text-gray-600">Manage your STOMP cast members</p>
              </div>
            </div>
            <Button variant="outline" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Search Bar */}
          <div className="flex items-center space-x-2 mt-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search cast members..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
        </CardHeader>

        <CardContent className="flex-1 overflow-hidden p-6">
          <Tabs defaultValue="current" className="h-full flex flex-col">
            <TabsList className="grid w-full grid-cols-2 flex-shrink-0">
              <TabsTrigger value="current" className="flex items-center space-x-2">
                <Users className="h-4 w-4" />
                <span>Current Company ({filteredCurrentCompany.length})</span>
              </TabsTrigger>
              <TabsTrigger value="archive" className="flex items-center space-x-2">
                <Archive className="h-4 w-4" />
                <span>Archive ({filteredArchive.length})</span>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="current" className="flex-1 overflow-auto mt-4 space-y-4">
              {/* Add New Member Form */}
              {showAddForm && (
                <Card className="border-dashed border-blue-300 bg-blue-50">
                  <CardContent className="p-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <Input
                          placeholder="Cast member name"
                          value={newMemberName}
                          onChange={(e) => setNewMemberName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              handleAddMember();
                            }
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
                        <Button onClick={handleAddMember} disabled={addMemberMutation.isPending}>
                          Add Member
                        </Button>
                        <Button variant="outline" onClick={() => setShowAddForm(false)}>
                          Cancel
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Add New Member Button */}
              {!showAddForm && (
                <Button
                  variant="dashed"
                  className="w-full border-dashed border-2 h-16 text-gray-600 hover:text-gray-900 hover:border-gray-400"
                  onClick={() => setShowAddForm(true)}
                >
                  <UserPlus className="h-5 w-5 mr-2" />
                  Add New Cast Member
                </Button>
              )}

              {/* Current Company List */}
              <div className="space-y-3">
                {filteredCurrentCompany.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    {searchTerm ? 'No cast members match your search' : 'No current company members'}
                  </div>
                ) : (
                  filteredCurrentCompany.map((member) => (
                    <Card key={member.id} className="hover:shadow-md transition-shadow">
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-3 flex-1">
                            <GripVertical className="h-4 w-4 text-gray-400 cursor-move" />
                            
                            <div className="flex-1">
                              {editingMember === member.id ? (
                                <Input
                                  defaultValue={member.name}
                                  className="font-medium"
                                  autoFocus
                                  onBlur={(e) => {
                                    handleUpdateName(member, e.target.value);
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      handleUpdateName(member, e.currentTarget.value);
                                    } else if (e.key === 'Escape') {
                                      setEditingMember(null);
                                    }
                                  }}
                                />
                              ) : (
                                <div
                                  className="font-medium cursor-pointer hover:text-blue-600 flex items-center space-x-2"
                                  onClick={() => setEditingMember(member.id)}
                                >
                                  <span>{member.name}</span>
                                  <Edit3 className="h-3 w-3 opacity-50" />
                                </div>
                              )}
                              
                              <div className="mt-2">
                                <RoleSelector
                                  selectedRoles={member.eligibleRoles}
                                  availableRoles={roles}
                                  onChange={(newRoles) => handleUpdateRoles(member, newRoles)}
                                  displayMode="badges"
                                />
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center space-x-2">
                            <Select onValueChange={(value) => {
                              if (value === 'on_tour') {
                                handleArchiveMember(member, 'on_tour', 'Moved to tour production');
                              } else if (value === 'substitute') {
                                handleArchiveMember(member, 'substitute', 'Available as substitute');
                              } else if (value === 'alumni') {
                                handleArchiveMember(member, 'alumni', 'Contract ended');
                              }
                            }}>
                              <SelectTrigger className="w-32">
                                <SelectValue placeholder="Archive" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="on_tour">Move to Tour</SelectItem>
                                <SelectItem value="substitute">Make Substitute</SelectItem>
                                <SelectItem value="alumni">Move to Alumni</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            </TabsContent>

            <TabsContent value="archive" className="flex-1 overflow-auto mt-4 space-y-4">
              {/* Archive Filter Tabs */}
              <Tabs value={archiveFilter} onValueChange={(value) => setArchiveFilter(value as any)} className="w-full">
                <TabsList className="grid w-full grid-cols-4">
                  <TabsTrigger value="all">All ({archiveCounts.all})</TabsTrigger>
                  <TabsTrigger value="on_tour">On Tour ({archiveCounts.on_tour})</TabsTrigger>
                  <TabsTrigger value="substitute">Substitutes ({archiveCounts.substitute})</TabsTrigger>
                  <TabsTrigger value="alumni">Alumni ({archiveCounts.alumni})</TabsTrigger>
                </TabsList>

                <TabsContent value={archiveFilter} className="mt-4">
                  <div className="space-y-3">
                    {filteredArchive.length === 0 ? (
                      <div className="text-center py-8 text-gray-500">
                        {searchTerm ? 'No archived members match your search' : 'No archived members in this category'}
                      </div>
                    ) : (
                      filteredArchive.map((member) => (
                        <Card key={member.id} className="bg-gray-50 hover:shadow-md transition-shadow">
                          <CardContent className="p-4">
                            <div className="flex items-center justify-between">
                              <div className="flex-1">
                                <div className="flex items-center space-x-3">
                                  <span className="font-medium text-gray-700">{member.name}</span>
                                  <Badge variant="secondary" className="text-xs">
                                    {member.archiveCategory?.replace('_', ' ') || 'Archived'}
                                  </Badge>
                                </div>
                                
                                <div className="mt-2 flex flex-wrap gap-1">
                                  {member.eligibleRoles.map((role) => (
                                    <Badge key={role} variant="outline" className="text-xs">
                                      {role}
                                    </Badge>
                                  ))}
                                </div>
                                
                                {member.archiveReason && (
                                  <p className="text-xs text-gray-500 mt-1">{member.archiveReason}</p>
                                )}
                                
                                <p className="text-xs text-gray-400 mt-1">
                                  Archived {member.dateArchived?.toLocaleDateString()}
                                </p>
                              </div>

                              <div className="flex items-center space-x-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleRestoreMember(member)}
                                  className="text-green-600 hover:text-green-700"
                                >
                                  <ArrowUp className="h-3 w-3 mr-1" />
                                  Restore
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleDeleteMember(member)}
                                  className="text-red-600 hover:text-red-700"
                                >
                                  <X className="h-3 w-3" />
                                </Button>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))
                    )}
                  </div>
                </TabsContent>
              </Tabs>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
