
import duckdb

DB_PATH = "/Users/yogs87/Downloads/LEADS_DATABASE/leads_intelligence.duckdb"

def create_unified_view():
    con = duckdb.connect(DB_PATH)
    print("Creating Unified Enrichment View...")

    # Strategy: 
    # 1. Group by unique identifiers (Phone or Email).
    # 2. Since many staging records only have one or the other, we'll create a master mapping.
    
    # Define a view that consolidates staging leads
    # We use arg_max to pick values from the 'best' source if multiple exist
    # For now, we'll just use simple aggregation to show the power.
    
    con.execute("""
    CREATE OR REPLACE VIEW unified_person_view AS
    WITH combined AS (
        -- Combine by Phone
        SELECT 
            phone,
            max(name) as name,
            max(email) as email,
            list(DISTINCT source_category) as sources,
            count(*) as hit_count
        FROM staging_leads
        WHERE phone IS NOT NULL
        GROUP BY phone
    )
    SELECT * FROM combined;
    """)

    print("View 'unified_person_view' created successfully.")
    
    # Show a sample of multi-source enrichment
    print("Sample of multi-source enriched leads:")
    sample = con.execute("""
        SELECT phone, name, email, sources, hit_count 
        FROM unified_person_view 
        WHERE len(sources) > 1 
        LIMIT 5
    """).fetchall()
    
    for row in sample:
        print(f"Phone: {row[0]} | Name: {row[1]} | Email: {row[2]} | Sources: {row[3]} | Hits: {row[4]}")

    con.close()

if __name__ == "__main__":
    create_unified_view()
