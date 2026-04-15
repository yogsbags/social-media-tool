
import duckdb
import os

DB_PATH = "/Users/yogs87/Downloads/LEADS_DATABASE/leads_intelligence.duckdb"
CSV_PATH = "extracted_leads_master.csv"

def integrate():
    print(f"Connecting to {DB_PATH}...")
    con = duckdb.connect(DB_PATH)
    
    print("Creating temporary staging table from CSV...")
    # DuckDB can read CSVs directly and extremely fast.
    con.execute(f"CREATE TABLE IF NOT EXISTS staging_leads AS SELECT * FROM read_csv_auto('{CSV_PATH}', ignore_errors=true, all_varchar=true, strict_mode=false)")
    
    print("Analyzing Staging Data...")
    count = con.execute("SELECT count(*) FROM staging_leads").fetchone()[0]
    print(f"Total Staged Records: {count}")
    
    unique_phones = con.execute("SELECT count(DISTINCT phone) FROM staging_leads WHERE phone IS NOT NULL").fetchone()[0]
    unique_emails = con.execute("SELECT count(DISTINCT email) FROM staging_leads WHERE email IS NOT NULL").fetchone()[0]
    print(f"Unique Phones: {unique_phones}")
    print(f"Unique Emails: {unique_emails}")
    
    print("Calculating Enrichment Overlap (Records with both Phone AND Email)...")
    overlap = con.execute("SELECT count(*) FROM staging_leads WHERE phone IS NOT NULL AND email IS NOT NULL").fetchone()[0]
    print(f"Multi-Field Enriched Records: {overlap}")
    
    print("Segmenting by Source for Fintech Insights...")
    sources = con.execute("SELECT source_category, count(*) as count FROM staging_leads GROUP BY source_category ORDER BY count DESC").fetchall()
    for s in sources:
        print(f" - {s[0]}: {s[1]}")

    con.close()

if __name__ == "__main__":
    integrate()
