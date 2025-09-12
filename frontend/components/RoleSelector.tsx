import React, { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { Plus, X } from 'lucide-react';
import type { Role } from '~backend/scheduler/types';

interface RoleSelectorProps {
  selectedRoles: Role[];
  availableRoles: Role[];
  onChange: (roles: Role[]) => void;
  placeholder?: string;
  displayMode?: 'badges' | 'dropdown';
}

const FEMALE_ONLY_ROLES: Role[] = ['Bin', 'Cornish'];

export function RoleSelector({
  selectedRoles,
  availableRoles,
  onChange,
  placeholder = "Select roles...",
  displayMode = 'dropdown'
}: RoleSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);

  const handleRoleToggle = (role: Role, checked: boolean) => {
    if (checked) {
      onChange([...selectedRoles, role]);
    } else {
      onChange(selectedRoles.filter(r => r !== role));
    }
  };

  const handleRemoveRole = (role: Role) => {
    onChange(selectedRoles.filter(r => r !== role));
  };

  const getRoleDescription = (role: Role): string => {
    if (FEMALE_ONLY_ROLES.includes(role)) {
      return `${role} (Female Only)`;
    }
    return role;
  };

  if (displayMode === 'badges') {
    return (
      <div className="space-y-2">
        <div className="flex flex-wrap gap-1">
          {selectedRoles.map((role) => (
            <Badge key={role} variant="default" className="text-xs flex items-center space-x-1">
              <span>{role}</span>
              <button
                onClick={() => handleRemoveRole(role)}
                className="ml-1 hover:bg-black hover:bg-opacity-20 rounded-full p-0.5 transition-colors"
              >
                <X className="h-2 w-2" />
              </button>
            </Badge>
          ))}
          
          <Popover open={isOpen} onOpenChange={setIsOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-6 text-xs">
                <Plus className="h-3 w-3" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-56 p-3" align="start">
              <div className="space-y-2">
                <h4 className="font-medium text-sm">Select Roles</h4>
                {availableRoles.map((role) => (
                  <div key={role} className="flex items-center space-x-2">
                    <Checkbox
                      id={`role-${role}`}
                      checked={selectedRoles.includes(role)}
                      onCheckedChange={(checked) => handleRoleToggle(role, checked as boolean)}
                    />
                    <label
                      htmlFor={`role-${role}`}
                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                    >
                      {getRoleDescription(role)}
                    </label>
                  </div>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>
    );
  }

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="w-full justify-start text-left">
          {selectedRoles.length === 0 ? (
            <span className="text-gray-500">{placeholder}</span>
          ) : (
            <div className="flex flex-wrap gap-1">
              {selectedRoles.slice(0, 3).map((role) => (
                <Badge key={role} variant="secondary" className="text-xs">
                  {role}
                </Badge>
              ))}
              {selectedRoles.length > 3 && (
                <Badge variant="secondary" className="text-xs">
                  +{selectedRoles.length - 3} more
                </Badge>
              )}
            </div>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-3" align="start">
        <div className="space-y-2">
          <h4 className="font-medium text-sm">Select Roles</h4>
          {availableRoles.map((role) => (
            <div key={role} className="flex items-center space-x-2">
              <Checkbox
                id={`role-${role}`}
                checked={selectedRoles.includes(role)}
                onCheckedChange={(checked) => handleRoleToggle(role, checked as boolean)}
              />
              <label
                htmlFor={`role-${role}`}
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
              >
                {getRoleDescription(role)}
              </label>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
