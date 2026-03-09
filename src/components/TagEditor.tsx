import { useState, useRef, useEffect } from 'react';

interface Props {
  label: string;
  values: string[];
  suggestions: string[];
  onChange: (vals: string[]) => void;
  color?: string;
}

export default function TagEditor({ label, values, suggestions, onChange, color = '#4f8ef7' }: Props) {
  const [input, setInput] = useState('');
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = suggestions.filter(
    s => s.toLowerCase().includes(input.toLowerCase()) && !values.includes(s)
  );

  function add(val: string) {
    const v = val.trim();
    if (v && !values.includes(v)) {
      onChange([...values, v]);
    }
    setInput('');
    setOpen(false);
  }

  function remove(val: string) {
    onChange(values.filter(v => v !== val));
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && input.trim()) {
      e.preventDefault();
      add(input);
    } else if (e.key === 'Backspace' && !input && values.length) {
      remove(values[values.length - 1]);
    }
  }

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (!(e.target as HTMLElement).closest('.tag-editor')) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div className="tag-editor" style={{ marginBottom: 8 }}>
      <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>{label}</div>
      <div
        style={{
          display: 'flex', flexWrap: 'wrap', gap: 4, padding: '4px 6px',
          border: '1px solid #ddd', borderRadius: 6, minHeight: 32,
          background: '#fff', cursor: 'text',
        }}
        onClick={() => inputRef.current?.focus()}
      >
        {values.map(v => (
          <span
            key={v}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 3,
              padding: '1px 7px', borderRadius: 12,
              background: color + '22', color, fontSize: 12, fontWeight: 500,
              border: `1px solid ${color}55`,
            }}
          >
            {v}
            <button
              onClick={e => { e.stopPropagation(); remove(v); }}
              style={{ border: 'none', background: 'none', cursor: 'pointer',
                color, fontSize: 13, lineHeight: 1, padding: 0, marginLeft: 1 }}
            >×</button>
          </span>
        ))}
        <input
          ref={inputRef}
          value={input}
          onChange={e => { setInput(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKey}
          placeholder={values.length === 0 ? `${label} 입력...` : ''}
          style={{
            border: 'none', outline: 'none', fontSize: 12, flex: 1, minWidth: 80,
            background: 'transparent',
          }}
        />
      </div>
      {open && filtered.length > 0 && (
        <div style={{
          position: 'absolute', zIndex: 100, background: '#fff',
          border: '1px solid #ddd', borderRadius: 6, boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
          maxHeight: 160, overflowY: 'auto', marginTop: 2,
        }}>
          {filtered.slice(0, 10).map(s => (
            <div
              key={s}
              onMouseDown={() => add(s)}
              style={{ padding: '6px 12px', cursor: 'pointer', fontSize: 13 }}
              onMouseEnter={e => (e.currentTarget.style.background = '#f5f5f5')}
              onMouseLeave={e => (e.currentTarget.style.background = '')}
            >
              {s}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
