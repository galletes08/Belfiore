-- Separate notes for new stock adjustments; existing records are untouched.
ALTER TABLE inventory_movements ADD COLUMN IF NOT EXISTS notes TEXT,
  ADD COLUMN IF NOT EXISTS previous_physical_stock INTEGER,
  ADD COLUMN IF NOT EXISTS new_physical_stock INTEGER;
