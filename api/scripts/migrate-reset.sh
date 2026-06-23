#!/bin/bash
# Reset database - Drops all tables and recreates fresh
# Usage: ./scripts/migrate-reset.sh

set -e

cd "$(dirname "$0")/.."

echo "⚠️  WARNING: This will DELETE ALL DATA in the database!"
echo ""
read -p "Are you sure? Type 'yes' to continue: " confirm

if [ "$confirm" != "yes" ]; then
    echo "❌ Cancelled"
    exit 1
fi

echo ""
echo "🔄 Running reset migration..."
echo ""

# Run all pending migrations so local reset includes admin API keys and roles.
cargo sqlx migrate run --source migrations

echo ""
echo "✅ Database reset complete!"
echo ""
echo "🚀 Next steps:"
echo "   1. Run the server: cargo run"
echo "   2. Bootstrap will automatically create admin user + API key"
echo ""
