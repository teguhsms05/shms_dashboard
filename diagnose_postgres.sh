#!/bin/bash
# Script untuk diagnose masalah koneksi PostgreSQL di server

echo "=== PostgreSQL Diagnostic Script ==="
echo ""

echo "1. Checking if PostgreSQL is running..."
if pgrep -x "postgres" > /dev/null; then
    echo "✓ PostgreSQL process is running"
    ps aux | grep postgres | grep -v grep | head -5
else
    echo "✗ PostgreSQL is NOT running"
    echo "  Try: sudo systemctl start postgresql"
fi
echo ""

echo "2. Checking PostgreSQL port..."
if command -v ss &> /dev/null; then
    PORT=$(ss -tlnp 2>/dev/null | grep postgres | awk '{print $4}' | cut -d: -f2 | head -1)
elif command -v netstat &> /dev/null; then
    PORT=$(netstat -tlnp 2>/dev/null | grep postgres | awk '{print $4}' | cut -d: -f2 | head -1)
else
    echo "Cannot detect port (ss/netstat not available)"
    PORT=""
fi

if [ -n "$PORT" ]; then
    echo "✓ PostgreSQL is listening on port: $PORT"
else
    echo "✗ Cannot detect PostgreSQL port"
fi
echo ""

echo "3. Testing connection to port 6543..."
if timeout 2 bash -c "</dev/tcp/localhost/6543" 2>/dev/null; then
    echo "✓ Port 6543 is open and accepting connections"
else
    echo "✗ Cannot connect to localhost:6543"
    echo "  Possible issues:"
    echo "  - PostgreSQL not running on port 6543"
    echo "  - Firewall blocking the port"
    echo "  - PostgreSQL configured to listen on different port"
fi
echo ""

echo "4. Checking PostgreSQL configuration..."
PG_CONF=""
if [ -f "/etc/postgresql/16/main/postgresql.conf" ]; then
    PG_CONF="/etc/postgresql/16/main/postgresql.conf"
elif [ -f "/var/lib/pgsql/data/postgresql.conf" ]; then
    PG_CONF="/var/lib/pgsql/data/postgresql.conf"
elif [ -f "/etc/postgresql/postgresql.conf" ]; then
    PG_CONF="/etc/postgresql/postgresql.conf"
fi

if [ -n "$PG_CONF" ]; then
    echo "Found config: $PG_CONF"
    echo "Port setting:"
    grep "^port" "$PG_CONF" 2>/dev/null || echo "  (using default port 5432)"
    echo "Listen addresses:"
    grep "^listen_addresses" "$PG_CONF" 2>/dev/null || echo "  (default: localhost)"
else
    echo "Cannot find postgresql.conf"
fi
echo ""

echo "5. Testing psql connection..."
if command -v psql &> /dev/null; then
    echo "Testing: psql -h localhost -p 6543 -U dsi -d shms -c 'SELECT 1;'"
    psql -h localhost -p 6543 -U dsi -d shms -c "SELECT 1;" 2>&1 | head -5
else
    echo "psql command not found"
fi
echo ""

echo "6. Checking temperature data..."
if command -v psql &> /dev/null; then
    echo "Query: SELECT COUNT(*) FROM temps;"
    psql -h localhost -p 6543 -U dsi -d shms -c "SELECT COUNT(*) FROM temps;" 2>&1
    echo ""
    echo "Latest 5 records:"
    psql -h localhost -p 6543 -U dsi -d shms -c "SELECT * FROM temps ORDER BY time DESC LIMIT 5;" 2>&1
fi
echo ""

echo "=== Diagnostic Complete ==="
