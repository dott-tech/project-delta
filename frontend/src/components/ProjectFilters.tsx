import React from 'react';
import { Search, MapPin, Filter, RotateCcw } from 'lucide-react';

interface ProjectFiltersProps {
  search: string;
  onSearchChange: (value: string) => void;
  locationFilter: string;
  onLocationChange: (value: string) => void;
  typeFilter: string;
  onTypeChange: (value: string) => void;
  locationsList: string[];
  typesList: string[];
  onReset: () => void;
}

export const ProjectFilters: React.FC<ProjectFiltersProps> = ({
  search,
  onSearchChange,
  locationFilter,
  onLocationChange,
  typeFilter,
  onTypeChange,
  locationsList,
  typesList,
  onReset,
}) => {
  const hasActiveFilters = search || locationFilter || typeFilter;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-lg mb-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Search Input */}
        <div className="relative">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search projects or descriptions..."
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Location Dropdown Filter */}
        <div className="relative">
          <MapPin className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <select
            value={locationFilter}
            onChange={(e) => onLocationChange(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none"
          >
            <option value="">All Locations</option>
            {locationsList.map((loc) => (
              <option key={loc} value={loc}>
                {loc}
              </option>
            ))}
          </select>
        </div>

        {/* Project Type Dropdown Filter */}
        <div className="relative">
          <Filter className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <select
            value={typeFilter}
            onChange={(e) => onTypeChange(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none"
          >
            <option value="">All Project Types</option>
            {typesList.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </div>

        {/* Reset Filters Button */}
        <button
          onClick={onReset}
          disabled={!hasActiveFilters}
          className="flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-40 disabled:hover:bg-slate-800 text-xs px-3 py-2 rounded-xl transition font-medium"
        >
          <RotateCcw className="w-3.5 h-3.5" /> Clear Filters
        </button>
      </div>
    </div>
  );
};