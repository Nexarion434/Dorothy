'use client';

import { useState, useMemo } from 'react';
import { Plus, ChevronsUpDown, Check } from 'lucide-react';
import type { AgentStatus } from '@/types/electron';
import { CHARACTER_FACES, STATUS_COLORS } from '../constants';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
import { Button } from '@/components/ui/button';

interface AddAgentDropdownProps {
  allAgents: AgentStatus[];
  currentTabAgentIds: string[];
  onAddAgent: (agentId: string) => void;
  onCreateAgent: () => void;
}

export default function AddAgentDropdown({
  allAgents,
  currentTabAgentIds,
  onAddAgent,
  onCreateAgent,
}: AddAgentDropdownProps) {
  const [open, setOpen] = useState(false);

  const groups = useMemo(() => {
    const tabSet = new Set(currentTabAgentIds);
    const available = allAgents.filter(a => !tabSet.has(a.id));

    const byProject = new Map<string, AgentStatus[]>();
    for (const agent of available) {
      const key = agent.projectPath;
      if (!byProject.has(key)) byProject.set(key, []);
      byProject.get(key)!.push(agent);
    }

    return Array.from(byProject.entries()).map(([path, agents]) => ({
      projectName: path.split('/').pop() || path,
      projectPath: path,
      agents,
    }));
  }, [allAgents, currentTabAgentIds]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="default" size="sm" className="gap-1.5 text-xs h-7">
          <Plus className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Add agent to board</span>
          <ChevronsUpDown className="w-3 h-3 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[240px] p-0" align="end">
        <Command>
          <CommandInput placeholder="Search agents..." />
          <CommandList>
            <CommandEmpty>No agents available.</CommandEmpty>

            {groups.map((group, i) => (
              <div key={group.projectPath}>
                {i > 0 && <CommandSeparator />}
                <CommandGroup heading={group.projectName}>
                  {group.agents.map(agent => {
                    const emoji = agent.name?.toLowerCase() === 'bitwonka'
                      ? '🐸'
                      : CHARACTER_FACES[agent.character || 'robot'] || '🤖';
                    const name = agent.name || `Agent ${agent.id.slice(0, 6)}`;
                    const status = STATUS_COLORS[agent.status] || STATUS_COLORS.idle;

                    return (
                      <CommandItem
                        key={agent.id}
                        value={name}
                        onSelect={() => { onAddAgent(agent.id); setOpen(false); }}
                        className="gap-2"
                      >
                        <span>{emoji}</span>
                        <span className="flex-1 truncate">{name}</span>
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${status.dot}`} />
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              </div>
            ))}

            <CommandSeparator />
            <CommandGroup>
              <CommandItem onSelect={() => { setOpen(false); onCreateAgent(); }} className="gap-2">
                <Plus className="w-3.5 h-3.5" />
                Create a new agent
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
