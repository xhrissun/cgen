import { useState, useEffect, useCallback } from 'react';
import api from '../api.js';
import { SectionLoader, EmptyState, Spinner } from './ui.jsx';

// ── Drag handle icon ────────────────────────────────────────────────────────
function DragHandle() {
  return (
    <svg className="w-4 h-4 text-gray-300 flex-shrink-0" viewBox="0 0 16 16" fill="currentColor">
      <circle cx="5" cy="3" r="1.2"/><circle cx="11" cy="3" r="1.2"/>
      <circle cx="5" cy="8" r="1.2"/><circle cx="11" cy="8" r="1.2"/>
      <circle cx="5" cy="13" r="1.2"/><circle cx="11" cy="13" r="1.2"/>
    </svg>
  );
}

// ── Reorderable clause list within one group ────────────────────────────────
function ReorderableClauseList({ groupId, initialClauses, onReordered }) {
  const [items, setItems] = useState(initialClauses || []);
  const [dragIdx, setDragIdx] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Sync when parent passes updated clauses (e.g. after group edit)
  useEffect(() => { setItems(initialClauses || []); }, [initialClauses]);

  const handleDragStart = (i) => setDragIdx(i);

  const handleDragOver = (e, i) => {
    e.preventDefault();
    if (dragIdx === null || dragIdx === i) return;
    const next = [...items];
    const [moved] = next.splice(dragIdx, 1);
    next.splice(i, 0, moved);
    setItems(next);
    setDragIdx(i);
  };

  const handleDrop = async () => {
    setDragIdx(null);
    setSaving(true);
    setSaved(false);
    try {
      const token = localStorage.getItem('token');
      await api.put(
        `/api/positions/clause-groups/${groupId}/reorder`,
        { clauseIds: items.map(c => c._id) },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      onReordered?.();
    } catch (err) {
      console.error('Reorder failed:', err);
      setItems(initialClauses); // revert
    } finally {
      setSaving(false);
    }
  };

  if (items.length === 0) {
    return <p className="text-xs text-gray-400 italic py-2">No clauses assigned yet.</p>;
  }

  return (
    <div className="space-y-1.5">
      {saving && (
        <div className="flex items-center gap-1.5 text-xs text-amber-600 font-medium py-1">
          <Spinner size="sm" color="gray" />Saving order…
        </div>
      )}
      {saved && (
        <div className="text-xs text-emerald-600 font-medium py-1 animate-fadeIn">
          ✓ Order saved
        </div>
      )}
      {items.map((clause, i) => (
        <div
          key={clause._id}
          draggable
          onDragStart={() => handleDragStart(i)}
          onDragOver={(e) => handleDragOver(e, i)}
          onDrop={handleDrop}
          onDragEnd={handleDrop}
          className={`
            flex items-start gap-2.5 text-sm rounded-lg px-3 py-2.5 border transition-all select-none
            cursor-grab active:cursor-grabbing
            ${dragIdx === i
              ? 'opacity-40 border-dashed border-blue-400 bg-blue-50'
              : 'bg-white border-gray-100 hover:border-gray-200 hover:shadow-sm'}
          `}
        >
          <div className="mt-0.5"><DragHandle /></div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-semibold bg-gray-100 text-gray-600">
                #{clause.clauseNumber}
              </span>
              {clause.sortOrder !== null && clause.sortOrder !== undefined && (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-indigo-50 text-indigo-600">
                  order: {clause.sortOrder}
                </span>
              )}
              {clause.clauseType && clause.clauseType !== 'NORMAL' && (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-blue-50 text-blue-700">
                  {clause.clauseType}
                </span>
              )}
            </div>
            <p className="mt-0.5 font-medium text-gray-800 truncate">
              {clause.title || clause.content?.substring(0, 80) + '…'}
            </p>
          </div>
          {/* Sequence badge showing position in group */}
          <div className="flex-shrink-0 w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center text-xs font-bold text-gray-500 mt-0.5">
            {i + 1}
          </div>
        </div>
      ))}
      <p className="text-xs text-gray-400 pt-1">☰ Drag to reorder within this group — auto-saved</p>
    </div>
  );
}

// ── Main component ──────────────────────────────────────────────────────────
function ClauseGroupManagement() {
  const [groups, setGroups] = useState([]);
  const [clauses, setClauses] = useState([]);
  const [loadingGroups, setLoadingGroups] = useState(true);
  const [savingForm, setSavingForm] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingGroup, setEditingGroup] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    selectedClauses: []   // ordered array — position matters
  });

  useEffect(() => {
    fetchGroups();
    fetchClauses();
  }, []);

  const fetchGroups = async () => {
    setLoadingGroups(true);
    try {
      const token = localStorage.getItem('token');
      const res = await api.get('/api/positions/clause-groups', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setGroups(res.data);
    } catch (err) {
      console.error('Error fetching groups:', err);
    } finally {
      setLoadingGroups(false);
    }
  };

  const fetchClauses = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await api.get('/api/positions/clauses/all', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setClauses(res.data);
    } catch (err) {
      console.error('Error fetching clauses:', err);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSavingForm(true);
    try {
      const token = localStorage.getItem('token');
      const payload = {
        name: formData.name,
        description: formData.description,
        clauses: formData.selectedClauses   // ordered array of IDs
      };
      if (editingGroup) {
        await api.put(`/api/positions/clause-groups/${editingGroup._id}`, payload, {
          headers: { Authorization: `Bearer ${token}` }
        });
      } else {
        await api.post('/api/positions/clause-groups', payload, {
          headers: { Authorization: `Bearer ${token}` }
        });
      }
      setShowForm(false);
      setEditingGroup(null);
      resetForm();
      fetchGroups();
    } catch (err) {
      alert('Error saving clause group: ' + (err.response?.data?.message || err.message));
    } finally {
      setSavingForm(false);
    }
  };

  const handleEdit = (group) => {
    setEditingGroup(group);
    setFormData({
      name: group.name,
      description: group.description || '',
      selectedClauses: group.clauses.map(c => c._id)
    });
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this clause group? This will not delete the clauses themselves.')) return;
    try {
      const token = localStorage.getItem('token');
      await api.delete(`/api/positions/clause-groups/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      fetchGroups();
    } catch (err) {
      alert('Error deleting: ' + (err.response?.data?.message || err.message));
    }
  };

  const resetForm = () => setFormData({ name: '', description: '', selectedClauses: [] });

  // Toggle clause selection in the form — keeps insertion order
  const toggleClause = (clauseId) => {
    setFormData(prev => ({
      ...prev,
      selectedClauses: prev.selectedClauses.includes(clauseId)
        ? prev.selectedClauses.filter(id => id !== clauseId)
        : [...prev.selectedClauses, clauseId]
    }));
  };

  // Drag-to-reorder inside the form's selected clause list
  const [formDragIdx, setFormDragIdx] = useState(null);

  const handleFormDragStart = (i) => setFormDragIdx(i);
  const handleFormDragOver = (e, i) => {
    e.preventDefault();
    if (formDragIdx === null || formDragIdx === i) return;
    const next = [...formData.selectedClauses];
    const [moved] = next.splice(formDragIdx, 1);
    next.splice(i, 0, moved);
    setFormData(prev => ({ ...prev, selectedClauses: next }));
    setFormDragIdx(i);
  };
  const handleFormDrop = () => setFormDragIdx(null);

  // Lookup helper
  const getClause = useCallback((id) => clauses.find(c => c._id === id), [clauses]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-xl font-bold">Clause Group Management</h3>
          <p className="text-sm text-gray-500 mt-0.5">
            Drag clauses within each group to control their render order in generated contracts.
          </p>
        </div>
        <button
          onClick={() => {
            setShowForm(!showForm);
            setEditingGroup(null);
            resetForm();
          }}
          className="btn btn-primary"
        >
          {showForm ? 'Cancel' : 'Create Group'}
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <div className="card">
          <h4 className="text-lg font-semibold mb-5">
            {editingGroup ? `Edit: ${editingGroup.name}` : 'New Clause Group'}
          </h4>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="form-label">Group Name</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="input"
                  required
                />
              </div>
              <div>
                <label className="form-label">Description</label>
                <input
                  type="text"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="input"
                  placeholder="Optional"
                />
              </div>
            </div>

            {/* Two-panel clause selector */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Left: available clauses */}
              <div>
                <label className="form-label">
                  Available Clauses
                  <span className="ml-1 text-gray-400 font-normal text-xs">— click to add</span>
                </label>
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <div className="max-h-80 overflow-y-auto divide-y divide-gray-100">
                    {clauses
                      .filter(c => !formData.selectedClauses.includes(c._id))
                      .map(clause => (
                        <button
                          type="button"
                          key={clause._id}
                          onClick={() => toggleClause(clause._id)}
                          className="w-full text-left px-4 py-3 hover:bg-green-50 hover:border-l-2 hover:border-green-500 transition-all group"
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
                              #{clause.clauseNumber}
                            </span>
                            <span className="text-sm font-medium text-gray-800 truncate group-hover:text-green-800">
                              {clause.title || 'Untitled'}
                            </span>
                            <span className="ml-auto text-green-500 opacity-0 group-hover:opacity-100 text-xs font-bold">+ Add</span>
                          </div>
                          <p className="text-xs text-gray-400 mt-0.5 truncate pl-8">
                            {clause.content?.substring(0, 80)}
                          </p>
                        </button>
                      ))}
                    {clauses.filter(c => !formData.selectedClauses.includes(c._id)).length === 0 && (
                      <p className="text-sm text-gray-400 text-center py-6">All clauses added</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Right: selected + draggable reorder */}
              <div>
                <label className="form-label">
                  Selected &amp; Ordered
                  <span className="ml-1 text-gray-400 font-normal text-xs">
                    — {formData.selectedClauses.length} clause{formData.selectedClauses.length !== 1 ? 's' : ''} · drag to reorder
                  </span>
                </label>
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <div className="max-h-80 overflow-y-auto">
                    {formData.selectedClauses.length === 0 ? (
                      <p className="text-sm text-gray-400 text-center py-10">No clauses selected yet</p>
                    ) : (
                      <div className="divide-y divide-gray-100">
                        {formData.selectedClauses.map((id, i) => {
                          const clause = getClause(id);
                          if (!clause) return null;
                          return (
                            <div
                              key={id}
                              draggable
                              onDragStart={() => handleFormDragStart(i)}
                              onDragOver={(e) => handleFormDragOver(e, i)}
                              onDrop={handleFormDrop}
                              onDragEnd={handleFormDrop}
                              className={`
                                flex items-center gap-2.5 px-3 py-2.5 transition-all
                                cursor-grab active:cursor-grabbing select-none
                                ${formDragIdx === i ? 'opacity-40 bg-blue-50' : 'hover:bg-gray-50'}
                              `}
                            >
                              <span className="text-xs font-bold text-gray-400 w-5 text-center">{i + 1}</span>
                              <DragHandle />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-xs font-semibold bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
                                    #{clause.clauseNumber}
                                  </span>
                                  <span className="text-sm font-medium text-gray-800 truncate">
                                    {clause.title || 'Untitled'}
                                  </span>
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => toggleClause(id)}
                                className="text-red-400 hover:text-red-600 text-lg font-bold leading-none flex-shrink-0"
                                title="Remove"
                              >×</button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button type="submit" className="btn btn-primary" disabled={savingForm}>
                {savingForm
                  ? <><Spinner size="sm" color="white" />{editingGroup ? 'Updating…' : 'Creating…'}</>
                  : (editingGroup ? 'Update Group' : 'Create Group')
                }
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => { setShowForm(false); setEditingGroup(null); resetForm(); }}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Groups list */}
      <div className="grid gap-4">
        {loadingGroups ? (
          <div className="card"><SectionLoader message="Loading clause groups…" /></div>
        ) : groups.length === 0 ? (
          <EmptyState
            icon="📂"
            title="No clause groups yet"
            description="Create a group to bundle related clauses and control their order."
          />
        ) : groups.map(group => (
          <div key={group._id} className="card">
            {/* Group header */}
            <div className="flex justify-between items-start mb-4">
              <div>
                <h4 className="text-base font-semibold text-gray-900">{group.name}</h4>
                {group.description && (
                  <p className="text-sm text-gray-500 mt-0.5">{group.description}</p>
                )}
                <p className="text-xs text-gray-400 mt-1">
                  {group.clauses?.length || 0} clause{group.clauses?.length !== 1 ? 's' : ''}
                </p>
              </div>
              <div className="flex gap-2 flex-shrink-0">
                <button
                  onClick={() => handleEdit(group)}
                  className="btn btn-secondary btn-sm"
                >
                  Edit
                </button>
                <button
                  onClick={() => handleDelete(group._id)}
                  className="btn btn-danger btn-sm"
                >
                  Delete
                </button>
              </div>
            </div>

            {/* Reorderable clause list */}
            <div className="border-t border-gray-100 pt-4">
              <ReorderableClauseList
                groupId={group._id}
                initialClauses={group.clauses || []}
                onReordered={fetchGroups}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default ClauseGroupManagement;