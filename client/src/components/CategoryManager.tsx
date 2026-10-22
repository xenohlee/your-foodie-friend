import { useState, type FormEvent } from "react";
import { Archive, Check, Pencil, Plus, RotateCcw, X } from "lucide-react";
import type { AdminCategory } from "@/lib/types";

interface CategoryManagerProps {
  categories: AdminCategory[];
  busy: boolean;
  onSave: (name: string, id?: string) => void;
  onToggle: (category: AdminCategory, enabled: boolean) => void;
}

export function CategoryManager({
  categories,
  busy,
  onSave,
  onToggle,
}: CategoryManagerProps) {
  const [newName, setNewName] = useState("");
  const [editing, setEditing] = useState<AdminCategory | null>(null);
  const [editName, setEditName] = useState("");

  function submitNew(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = newName.trim();
    if (!name) return;
    onSave(name);
    setNewName("");
  }

  function submitEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing || !editName.trim()) return;
    onSave(editName.trim(), editing.id);
    setEditing(null);
    setEditName("");
  }

  const sorted = [...categories].sort(
    (a, b) =>
      Number(b.isEnabled) - Number(a.isEnabled) || a.name.localeCompare(b.name)
  );

  return (
    <section
      className="category-manager"
      aria-labelledby="category-manager-title"
    >
      <div className="category-manager__heading">
        <div>
          <h3 id="category-manager-title">Menu categories</h3>
          <p>Categories appear when they contain published menu items.</p>
        </div>
        <span>
          {categories.filter(category => category.isEnabled).length} active
        </span>
      </div>
      <form className="admin-category-create" onSubmit={submitNew}>
        <label className="sr-only" htmlFor="new-menu-category">
          New category name
        </label>
        <input
          id="new-menu-category"
          value={newName}
          onChange={event => setNewName(event.target.value)}
          placeholder="Add a category"
          maxLength={60}
          required
        />
        <button
          className="button button--outline button--small"
          disabled={busy || newName.trim().length < 2}
        >
          <Plus size={14} /> Add
        </button>
      </form>
      {categories.length ? (
        <ul className="admin-category-list">
          {sorted.map(category => (
            <li
              key={category.id}
              className={!category.isEnabled ? "is-archived" : ""}
            >
              {editing?.id === category.id ? (
                <form className="admin-category-edit" onSubmit={submitEdit}>
                  <label
                    className="sr-only"
                    htmlFor={`category-${category.id}`}
                  >
                    Rename {category.name}
                  </label>
                  <input
                    id={`category-${category.id}`}
                    value={editName}
                    onChange={event => setEditName(event.target.value)}
                    maxLength={60}
                    required
                    autoFocus
                  />
                  <button
                    type="submit"
                    className="icon-button"
                    aria-label={`Save ${category.name}`}
                    disabled={busy || editName.trim().length < 2}
                  >
                    <Check size={16} />
                  </button>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label="Cancel category edit"
                    onClick={() => setEditing(null)}
                  >
                    <X size={16} />
                  </button>
                </form>
              ) : (
                <>
                  <span className="admin-category-name">
                    {category.name}
                    <small>
                      {category.productCount}{" "}
                      {category.productCount === 1 ? "item" : "items"}
                    </small>
                  </span>
                  <span
                    className={`admin-category-state${category.isEnabled ? " is-active" : ""}`}
                  >
                    {category.isEnabled ? "Active" : "Archived"}
                  </span>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={`Rename ${category.name}`}
                    disabled={busy}
                    onClick={() => {
                      setEditing(category);
                      setEditName(category.name);
                    }}
                  >
                    <Pencil size={15} />
                  </button>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={`${category.isEnabled ? "Archive" : "Restore"} ${category.name}`}
                    title={
                      category.productCount
                        ? "Move all products out of this category before archiving"
                        : undefined
                    }
                    disabled={
                      busy || (category.isEnabled && category.productCount > 0)
                    }
                    onClick={() => onToggle(category, !category.isEnabled)}
                  >
                    {category.isEnabled ? (
                      <Archive size={15} />
                    ) : (
                      <RotateCcw size={15} />
                    )}
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="category-manager__empty">
          No categories yet. Add one, then assign a menu item to it.
        </p>
      )}
    </section>
  );
}
