import pandas as pd
import json
import numpy as np

def convert_excel_to_json(excel_path, sheet_name, output_path):
    """
    Reads journal data from an Excel sheet and converts it into a JSON object
    formatted for the Tampermonkey script.

    Args:
        excel_path (str): The path to the input Excel file.
        sheet_name (str): The name of the sheet containing the journal data.
        output_path (str): The path where the output JSON file will be saved.
    """
    try:
        # Read the specified sheet from the Excel file
        df = pd.read_excel(excel_path, sheet_name=sheet_name)
        print(f"Successfully loaded {len(df)} rows from sheet '{sheet_name}'.")

        # Define the mapping from Excel columns to JSON keys
        column_mapping = {
            'Name': 'name',
            'Abbr Name': 'abbr',
            'ISSN': 'issn',
            'JIF': 'if',
            'JIF5Years': 'if5y',
            'Category': 'category'
        }

        # Check if all required columns exist
        required_columns = list(column_mapping.keys())
        missing_cols = [col for col in required_columns if col not in df.columns]
        if missing_cols:
            print(f"Error: Missing required columns in the Excel file: {', '.join(missing_cols)}")
            return

        journal_data = {}

        for index, row in df.iterrows():
            # Use the full 'Name' as the primary key for the dictionary
            journal_name = row['Name']
            if pd.isna(journal_name):
                continue

            # Replace numpy.nan with None (which becomes null in JSON) or empty string
            # and format the entry for the current journal
            journal_entry = {
                "abbr": str(row.get('Abbr Name', '')).strip(),
                "issn": str(row.get('ISSN', '')).strip(),
                "if": str(row.get('JIF', '')).strip(),
                "if5y": str(row.get('JIF5Years', '')).strip(),
                "category": str(row.get('Category', '')).strip()
            }
            
            # Clean up 'N/A' or nan strings that might result from conversion
            for key, value in journal_entry.items():
                if value.lower() in ['nan', 'na', 'n/a']:
                    journal_entry[key] = ""

            journal_data[str(journal_name).strip()] = journal_entry

        # Write the dictionary to a JSON file with pretty printing
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(journal_data, f, indent=4, ensure_ascii=False)

        print(f"Successfully converted data to '{output_path}'.")
        print(f"Total journals processed: {len(journal_data)}")

    except FileNotFoundError:
        print(f"Error: The file '{excel_path}' was not found.")
    except Exception as e:
        print(f"An unexpected error occurred: {e}")

if __name__ == '__main__':
    # --- CONFIGURATION ---
    # 1. Replace with the actual path to your Excel file.
    EXCEL_FILE_PATH = 'E:\\Code\\VScode\\Data and Project\\Python\\Chrome CRX\\分区数据表\\2024分区数据.xlsx'
    # 2. Specify the sheet name that contains the data.
    SHEET_NAME = 'IF>10'
    # 3. Specify the desired name for the output JSON file.
    OUTPUT_JSON_PATH = './分区数据表/journal_data.json'
    # --- END CONFIGURATION ---

    convert_excel_to_json(EXCEL_FILE_PATH, SHEET_NAME, OUTPUT_JSON_PATH) 