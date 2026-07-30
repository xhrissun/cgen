import sys
import os
from weasyprint import HTML

def convert_html_to_pdf(html_path, pdf_path, replacements):
    with open(html_path, 'r', encoding='utf-8') as f:
        html_content = f.read()
    
    for key, value in replacements.items():
        html_content = html_content.replace(f'{{{{{key}}}}}', str(value))
    
    # WeasyPrint handles the @page size: A5 from the CSS
    HTML(string=html_content, base_url=os.path.dirname(html_path)).write_pdf(pdf_path)

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python3 html_to_pdf.py <html_template_path> <output_pdf_path> [key=value ...]")
        sys.exit(1)
    
    html_template = sys.argv[1]
    output_pdf = sys.argv[2]
    
    replacements = {}
    for arg in sys.argv[3:]:
        if '=' in arg:
            key, value = arg.split('=', 1)
            replacements[key] = value
            
    try:
        convert_html_to_pdf(html_template, output_pdf, replacements)
        print(f"Successfully generated PDF: {output_pdf}")
    except Exception as e:
        print(f"Error generating PDF: {str(e)}")
        sys.exit(1)
