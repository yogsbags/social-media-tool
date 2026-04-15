
import os
import pandas as pd
import re
import zipfile
import io

def normalize_phone(phone):
    if not phone: return None
    s = str(phone).strip()
    s = re.sub(r'\D', '', s) # Keep only digits
    if s.startswith('91') and len(s) == 12:
        return s[2:]
    if len(s) == 10:
        return s
    return None

def normalize_email(email):
    if not email: return None
    s = str(email).strip().lower()
    if '@' in s and '.' in s:
        return s
    return None

def extract_from_df(df, category, filename):
    try:
        # Find columns
        email_col = None
        phone_col = None
        name_col = None

        for col in df.columns:
            c_low = str(col).lower()
            if 'email' in c_low or 'mail' in c_low: email_col = col
            if 'phone' in c_low or 'mobile' in c_low or 'contact' in c_low or 'no' in c_low: phone_col = col
            if 'name' in c_low: name_col = col

        if not email_col or not phone_col:
            for col in df.columns:
                if df[col].empty: continue
                val = str(df[col].iloc[0])
                if '@' in val: email_col = col
                if re.search(r'\d{10}', val): phone_col = col

        data_list = []
        for _, row in df.iterrows():
            email = normalize_email(row.get(email_col)) if email_col else None
            phone = normalize_phone(row.get(phone_col)) if phone_col else None
            name = str(row.get(name_col)).strip() if name_col else "Unknown"
            
            if email or phone:
                data_list.append({
                    'name': name,
                    'email': email,
                    'phone': phone,
                    'source_category': category,
                    'file_source': filename
                })
        return data_list
    except:
        return []

def process_file_content(content, filename, category):
    try:
        if filename.endswith('.xlsx') or filename.endswith('.xls'):
            df = pd.read_excel(io.BytesIO(content))
            return extract_from_df(df, category, filename)
        elif filename.endswith('.csv'):
            df = pd.read_csv(io.BytesIO(content), on_bad_lines='skip')
            return extract_from_df(df, category, filename)
    except:
        pass
    return []

def extract_from_zip(zip_path, category):
    print(f"Opening ZIP: {zip_path}")
    results = []
    try:
        with zipfile.ZipFile(zip_path, 'r') as z:
            for zname in z.namelist():
                if zname.endswith(('.xlsx', '.csv', '.xls')) and not os.path.basename(zname).startswith('~$'):
                    with z.open(zname) as f:
                        results.extend(process_file_content(f.read(), zname, category))
    except Exception as e:
        print(f"Error ZIP {zip_path}: {e}")
    return results

def extract_from_path(file_path, category):
    if file_path.endswith('.zip'):
        return extract_from_zip(file_path, category)
    
    print(f"Processing: {file_path}")
    try:
        if file_path.endswith('.xlsx') or file_path.endswith('.xls'):
            df = pd.read_excel(file_path)
        elif file_path.endswith('.csv'):
            df = pd.read_csv(file_path, on_bad_lines='skip')
        else:
            return []
        return extract_from_df(df, category, os.path.basename(file_path))
    except Exception as e:
        print(f"Error {file_path}: {e}")
        return []

def main():
    base_dirs = [
        "high_value_extracted",
        "/Users/yogs87/Downloads/1 Crore Online SHoppers Data",
        "/Users/yogs87/Downloads/Pan India Database",
        "/Users/yogs87/Downloads/TrueCaller Database",
        "/Users/yogs87/Downloads/Database-1",
        "/Users/yogs87/Downloads/Database-2"
    ]
    
    output_file = "extracted_leads_master.csv"
    
    for b_dir in base_dirs:
        category = os.path.basename(b_dir)
        for root, dirs, files in os.walk(b_dir):
            for file in files:
                if file.endswith(('.xlsx', '.csv', '.xls', '.zip')) and not file.startswith('~$'):
                    f_path = os.path.join(root, file)
                    extracted = extract_from_path(f_path, category)
                    
                    if extracted:
                        res_df = pd.DataFrame(extracted)
                        # Append to master file
                        res_df.to_csv(output_file, mode='a', index=False, header=not os.path.exists(output_file))
                        print(f"Saved {len(extracted)} records from {file}")

if __name__ == "__main__":
    main()
