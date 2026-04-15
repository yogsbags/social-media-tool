
import os
import subprocess

def extract_rar(file_path, output_dir):
    print(f"Extracting: {file_path}")
    # Create a subfolder for each rar based on its name
    # Clean up name to avoid shell issues
    base_name = os.path.basename(file_path).replace('.rar', '').replace(' ', '_')
    subfolder = os.path.join(output_dir, base_name)
    os.makedirs(subfolder, exist_ok=True)
    
    try:
        # unar -o <outdir> -f <rar_path>
        # -f: force overwrite
        # -q: quiet
        subprocess.run(['unar', '-o', subfolder, '-f', file_path], check=True, capture_output=True)
        print(f"Successfully extracted to {subfolder}")
    except subprocess.CalledProcessError as e:
        print(f"Error extracting {file_path}: {e.stderr.decode()}")

def main():
    search_roots = [
        "/Users/yogs87/Downloads/HNI data",
        "/Users/yogs87/Downloads/Corporate data",
        "/Users/yogs87/Downloads/Database-1",
        "/Users/yogs87/Downloads/Database-2"
    ]
    
    output_base = "high_value_extracted"
    os.makedirs(output_base, exist_ok=True)
    
    for root_dir in search_roots:
        if not os.path.exists(root_dir):
            print(f"Directory not found: {root_dir}")
            continue
            
        for root, dirs, files in os.walk(root_dir):
            for file in files:
                if file.lower().endswith('.rar'):
                    f_path = os.path.join(root, file)
                    extract_rar(f_path, output_base)

if __name__ == "__main__":
    main()
