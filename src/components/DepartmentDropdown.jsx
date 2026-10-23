import { useEffect, useRef, useState } from "react";
import { departmentNames, useSettings } from "../lib/settings";
import { handleMenuKeyDown } from "../lib/useDialog";
import { MENU, MENU_HEADING, MENU_ITEM } from "../lib/ui";
import Icon from "./Icon";

// The Scheduler's department picker: "All departments" (preview only) plus
// every active department. `value` is a department name or "all".
export default function DepartmentDropdown({ value, onChange }) {
  const settings = useSettings();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const btnRef = useRef(null);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    window.addEventListener("mousedown", onDown);
    menuRef.current?.querySelector('[aria-selected="true"]')?.focus();
    return () => {
      window.removeEventListener("mousedown", onDown);
    };
  }, [open]);

  function close(refocus) {
    setOpen(false);
    if (refocus) btnRef.current?.focus();
  }

  const isAll = value === "all";
  const label = isAll ? "All departments" : value;

  const options = [
    { value: "all", label: "All departments", preview: true },
    ...departmentNames(settings, { activeOnly: true, keep: value })
      .sort((a, b) => a.localeCompare(b))
      .map((d) => ({ value: d, label: d, preview: false })),
  ];

  return (
    <div ref={wrapRef} className="relative min-w-0 w-full lg:w-auto">
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" && !open) {
            e.preventDefault();
            setOpen(true);
          }
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Department: ${label}`}
        className={`inline-flex items-center gap-2 rounded-xl px-3 sm:px-3.5 h-10 sm:h-11 lg:h-10 text-sm font-semibold transition w-full lg:min-w-[9rem] lg:w-auto justify-between bg-white shadow-card ${
          open
            ? "ring-2 ring-green-600"
            : "ring-1 ring-inset ring-slate-200 hover:ring-slate-300 hover:bg-slate-50"
        }`}
      >
        <span className="flex items-center gap-2 min-w-0">
          <Icon
            name="building"
            size={16}
            className={`shrink-0 ${isAll ? "text-green-600" : "text-slate-400"}`}
          />
          <span
            className={`truncate ${isAll ? "text-green-700" : "text-slate-800"}`}
          >
            {label}
          </span>
        </span>

        <Icon
          name="chevronDown"
          size={16}
          className={`text-slate-400 shrink-0 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div
          ref={menuRef}
          role="listbox"
          aria-label="Select department"
          onKeyDown={(e) => handleMenuKeyDown(e, menuRef.current, close)}
          className={`absolute z-40 top-full left-0 mt-2 w-72 max-w-[calc(100vw-2rem)] max-h-[60vh] overflow-y-auto overscroll-contain scroll-thin ${MENU}`}
        >
          <div className={MENU_HEADING} aria-hidden="true">
            Select department
          </div>

          {options.map((opt) => {
            const active = value === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => {
                  close(true);
                  onChange(opt.value);
                }}
                className={`${MENU_ITEM} ${
                  active
                    ? "bg-green-50 text-green-800 focus:bg-green-100"
                    : "text-slate-700 hover:bg-slate-100 focus:bg-slate-100"
                }`}
              >
                <span className="flex-1 truncate font-medium">{opt.label}</span>

                {opt.preview && (
                  <span className="text-[0.625rem] uppercase tracking-wider font-bold text-green-700 bg-white ring-1 ring-inset ring-green-600/20 rounded-full px-1.5 py-0.5 shrink-0">
                    Preview
                  </span>
                )}

                {active && (
                  <Icon
                    name="check"
                    size={16}
                    strokeWidth={3}
                    className="text-green-600 shrink-0"
                  />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
