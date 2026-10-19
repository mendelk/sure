class AddEntryableLookupIndexToEntries < ActiveRecord::Migration[8.1]
  disable_ddl_transaction!

  def change
    add_index :entries, [ :entryable_type, :entryable_id ],
      name: "index_entries_on_entryable",
      algorithm: :concurrently
  end
end
