import { ChevronDown } from "lucide-react";

/**
 * THE one dropdown-filter control — used by the Candidates list and
 * Territory Discovery's filter panel alike, so "what does a filter
 * dropdown look like" has one real answer, not a per-page reimplementation.
 */
export function FilterSelect({
  value,
  onChange,
  placeholder,
  options,
  fullWidth = false,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  options: { value: string; label: string }[];
  // Candidates' toolbar sizes each select to its content (inline, several
  // in a row); Territory Discovery's stacked sidebar wants each control to
  // span the panel — same component, different container, opt in per use.
  fullWidth?: boolean;
}) {
  return (
    <div className={`relative ${fullWidth ? "w-full" : ""}`}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`h-[34px] appearance-none rounded-lg border border-stone-300 bg-white py-1.5 pl-3 pr-8 text-[13px] text-stone-600 shadow-sm hover:border-stone-400 focus:border-forest-500 focus:outline-none ${fullWidth ? "w-full" : ""}`}
      >
        <option value="">{placeholder}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown size={13} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-400" />
    </div>
  );
}
