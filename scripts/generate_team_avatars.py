import os
from PIL import Image, ImageDraw, ImageFont

def generate_avatar(name_id, initials, contribution, web_dir, mobile_dir):
    width, height = 512, 512
    img = Image.new('RGB', (width, height), '#141414')
    draw = ImageDraw.Draw(img)

    # Gradient background
    for y in range(height):
        ratio = y / height
        # Gradient from #121212 (18, 18, 18) to #2a2a28 (42, 42, 40)
        r = int(18 + (42 - 18) * ratio)
        g = int(18 + (42 - 18) * ratio)
        b = int(18 + (40 - 18) * ratio)
        draw.line([(0, y), (width, y)], fill=(r, g, b))

    # Subtle techno-grid lines
    grid_color = (36, 36, 34)
    for x in range(0, width, 48):
        draw.line([(x, 0), (x, height)], fill=grid_color, width=1)
    for y in range(0, height, 48):
        draw.line([(0, y), (width, y)], fill=grid_color, width=1)

    # Outer decorative frame
    draw.rectangle([(16, 16), (width - 16, height - 16)], outline=(50, 50, 46), width=2)
    # Volt accent corner ticks
    tick = 16
    volt_color = (206, 233, 46) # #CEE92E
    # Top-left corner
    draw.line([(16, 16), (16 + tick, 16)], fill=volt_color, width=3)
    draw.line([(16, 16), (16, 16 + tick)], fill=volt_color, width=3)
    # Top-right corner
    draw.line([(width - 16, 16), (width - 16 - tick, 16)], fill=volt_color, width=3)
    draw.line([(width - 16, 16), (width - 16, 16 + tick)], fill=volt_color, width=3)
    # Bottom-left corner
    draw.line([(16, height - 16), (16 + tick, height - 16)], fill=volt_color, width=3)
    draw.line([(16, height - 16), (16, height - 16 - tick)], fill=volt_color, width=3)
    # Bottom-right corner
    draw.line([(width - 16, height - 16), (width - 16 - tick, height - 16)], fill=volt_color, width=3)
    draw.line([(width - 16, height - 16), (width - 16, height - 16 - tick)], fill=volt_color, width=3)

    # Fonts
    anton_path = 'node_modules/@expo-google-fonts/anton/400Regular/Anton_400Regular.ttf'
    font_initials = ImageFont.truetype(anton_path, 160)

    # Center initials
    bbox = font_initials.getbbox(initials)
    text_w = bbox[2] - bbox[0]
    text_h = bbox[3] - bbox[1]
    tx = (width - text_w) // 2 - bbox[0]
    ty = (height - text_h) // 2 - bbox[1]
    draw.text((tx, ty), initials, font=font_initials, fill=volt_color)

    # Save to both web and mobile
    for target_dir in (web_dir, mobile_dir):
        os.makedirs(target_dir, exist_ok=True)
        png_path = os.path.join(target_dir, f"{name_id}.png")
        jpg_path = os.path.join(target_dir, f"{name_id}.jpg")
        img.save(png_path, format="PNG")
        img.save(jpg_path, format="JPEG", quality=95)
        print(f"Saved {png_path} and {jpg_path}")

def main():
    members = [
        ("navarro", "AN", "Architecture & Integration"),
        ("pameroyan", "AP", "Inventory & Payments"),
        ("deborja", "JD", "Storefront & UI/UX"),
        ("carlos", "RC", "Testing & Deployment"),
        ("nogoy", "MN", "Database & Security"),
    ]
    web_team = os.path.abspath("web/assets/team")
    mobile_team = os.path.abspath("mobile/assets/team")

    for name_id, initials, contrib in members:
        generate_avatar(name_id, initials, contrib, web_team, mobile_team)

if __name__ == "__main__":
    main()
