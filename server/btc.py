import numpy as np
from PIL import Image
import time
import io
import struct
import json
import sys
import base64
import struct


def img_toNparray(image_file):
    image = Image.open(image_file).convert("L")
    return np.array(image)


def img_dimention_revision(image, block_size):
    height, width = image.shape
    height = (height // block_size) * block_size
    width = (width // block_size) * block_size
    image = image[:height, :width]

    return image


# Block Truncation Coding (BTC) Compression
def btc_encode(block):
    mean = np.mean(block)
    std = np.std(block)
    bitmap = block >= mean
    upper = mean + std
    lower = mean - std
    return bitmap, upper, lower


def btc_decode(bitmap, upper, lower, block_size):
    if bitmap.size != block_size * block_size:
        bitmap = np.resize(bitmap, (block_size, block_size))
    block = np.zeros((block_size, block_size), dtype=float)
    block[bitmap.astype(bool)] = upper
    block[~bitmap.astype(bool)] = lower
    return block


def btc_compress_image(image, block_size):
    """Compress the image using BTC."""
    compressed = []
    height, width = image.shape
    for i in range(0, height, block_size):
        for j in range(0, width, block_size):
            block = image[i : i + block_size, j : j + block_size]
            bitmap, upper, lower = btc_encode(block)
            compressed.append((bitmap, upper, lower))

    return compressed, (height, width)


# Absolute Moment BTC (AMBTC)
def am_btc_encode(block):
    """AMBTC encoding using absolute moment differences."""
    mean = np.mean(block)
    abs_moment = np.mean(np.abs(block - mean))
    bitmap = block >= mean
    upper = mean + abs_moment
    lower = mean - abs_moment
    return bitmap, upper, lower


def am_btc_compress_image(image, block_size=4):
    """Compress the image using AMBTC."""
    compressed = []
    height, width = image.shape
    for i in range(0, height, block_size):
        for j in range(0, width, block_size):
            block = image[i : i + block_size, j : j + block_size]
            bitmap, upper, lower = am_btc_encode(block)
            compressed.append((bitmap, upper, lower))
    return compressed, (height, width)


# Maximum-Minimum BTC (MMBTC)
def mm_btc_encode(block):
    """MMBTC encoding by calculating maximum and minimum values."""
    mean = np.mean(block)
    bitmap = block >= mean
    upper = np.max(block)
    lower = np.min(block)
    return bitmap, upper, lower


def mm_btc_compress_image(image, block_size=4):
    """Compress the image using MMBTC."""
    compressed = []
    height, width = image.shape
    for i in range(0, height, block_size):
        for j in range(0, width, block_size):
            block = image[i : i + block_size, j : j + block_size]
            bitmap, upper, lower = mm_btc_encode(block)
            compressed.append((bitmap, upper, lower))

    return compressed, (height, width)


# Metrics Calculation
def calculate_psnr(original_image, decompressed_image):
    """Calculate PSNR between the original and decompressed image."""
    mse = np.mean((original_image - decompressed_image) ** 2)
    if mse == 0:
        return float("inf")
    max_pixel = 255.0
    return 10 * np.log10(max_pixel**2 / mse)


def calculate_ssim(original_image, decompressed_image):
    """Calculate SSIM between the original and decompressed image using NumPy."""
    # Ensure images are float64 for precision
    original_image = original_image.astype(np.float64)
    decompressed_image = decompressed_image.astype(np.float64)

    # Constants for SSIM calculation
    C1 = 6.5025
    C2 = 58.5225

    # Mean of the images
    mu1 = np.mean(original_image)
    mu2 = np.mean(decompressed_image)

    # Variance of the images
    sigma1_sq = np.var(original_image)
    sigma2_sq = np.var(decompressed_image)

    # Covariance between the two images
    sigma12 = np.cov(original_image.flatten(), decompressed_image.flatten())[0][1]

    # SSIM formula
    ssim = ((2 * mu1 * mu2 + C1) * (2 * sigma12 + C2)) / (
        (mu1**2 + mu2**2 + C1) * (sigma1_sq + sigma2_sq + C2)
    )

    return ssim


def calculate_compression_ratio(original_image, compressed_data):
    """Calculate Compression Ratio (CR)."""
    original_size = original_image.size * 8  # Bits
    compressed_size = sum(
        [
            bitmap.size + 16 for bitmap, upper, lower in compressed_data
        ]  # Plus 2 bytes for upper and lower values
    )
    return original_size / compressed_size


# Compressing and Evaluating
def compress_and_evaluate(image, method, block_size=4):
    if method == "btc":
        compress_func = btc_compress_image
    elif method == "ambtc":
        compress_func = am_btc_compress_image
    elif method == "mmbtc":
        compress_func = mm_btc_compress_image
    else:
        raise ValueError("Unknown method!", method)

    start_time = time.time()
    compressed_data, image_size = compress_func(image, block_size)
    compress_execution_time = time.time() - start_time

    start_time = time.time()
    decompressed_image = btc_decompress(compressed_data, image_size, block_size)
    decompress_execution_time = time.time() - start_time

    compression_ratio = calculate_compression_ratio(image, compressed_data)
    ssim_value = calculate_ssim(image, decompressed_image)
    psnr_value = calculate_psnr(image, decompressed_image)

    import tempfile

    with tempfile.NamedTemporaryFile(delete=False, suffix=".bin") as temp_file:
        save_compressed_data(compressed_data, block_size, image_size, temp_file)

        temp_file_path = temp_file.name

    evaluation = {
        "compression_ratio": compression_ratio,
        "ssim": ssim_value,
        "psnr": psnr_value,
        "compress_execution_time": compress_execution_time,
        "decompress_execution_time": decompress_execution_time,
        "compressed_file": temp_file_path,
    }

    return evaluation


def btc_decompress(compressed_data, image_size, block_size):
    height, width = image_size
    decompressed = np.zeros((height, width), dtype=float)
    index = 0

    for i in range(0, height, block_size):
        for j in range(0, width, block_size):
            try:
                bitmap, upper, lower = compressed_data[index]
                index += 1
                bitmap = np.resize(bitmap, (block_size, block_size))
                block = btc_decode(bitmap, upper, lower, block_size)
                block_height = min(block_size, height - i)
                block_width = min(block_size, width - j)
                decompressed[i : i + block_height, j : j + block_width] = block[
                    :block_height, :block_width
                ]
            except IndexError:
                print(f"Index {index} exceeds compressed data length.")
                break
            except ValueError as e:
                print(f"Error at index {index}: {e}")
                continue

    return decompressed


def save_compressed_data(compressed, block_size, image_size, file):
    file.write(f"{block_size}\n".encode("utf-8"))
    file.write(f"{image_size[0]} {image_size[1]}\n".encode("utf-8"))
    for bitmap, upper, lower in compressed:
        packed_bitmap = np.packbits(bitmap).tobytes()

        file.write(struct.pack("f", upper))
        file.write(struct.pack("f", lower))
        file.write(packed_bitmap)


def load_compressed_data(source):
    compressed = []
    if isinstance(source, str):
        with open(source, "rb") as file:
            data = file.read()
    else:
        data = source

    buffer = io.BytesIO(data)
    try:
        block_size = int(buffer.readline().decode("utf-8").strip())
        height, width = map(int, buffer.readline().decode("utf-8").strip().split())
    except Exception as e:
        raise ValueError(f"Error while reading header data: {e}")

    expected_bitmap_size = (block_size * block_size) // 8
    while True:
        try:
            upper = buffer.read(4)
            if not upper:
                break
            lower = buffer.read(4)
            packed_bitmap = buffer.read(expected_bitmap_size)

            bitmap = np.unpackbits(np.frombuffer(packed_bitmap, dtype=np.uint8))[
                : block_size * block_size
            ].reshape((block_size, block_size))

            compressed.append(
                (bitmap, struct.unpack("f", upper)[0], struct.unpack("f", lower)[0])
            )

        except Exception as e:
            raise ValueError(
                f"Error while reading compressed data: {e}, Bitmap size: {bitmap.size if 'bitmap' in locals() else 'unknown'}, "
                f"Block index: {len(compressed)}, Block size: {block_size}, Expected: {block_size * block_size} bits"
            )

    return compressed, block_size, (height, width)


def decompress_file(compressed_file_path):
    try:
        compressed_blocks, block_size, image_size = load_compressed_data(
            compressed_file_path
        )

        decompressed_image = btc_decompress(
            compressed_blocks, image_size, block_size
        )  # Pass the image size

        # Convert the decompressed image to a format that can be sent back to the client (e.g., base64 PNG)
        pil_image = Image.fromarray(decompressed_image.clip(0, 255).astype(np.uint8))
        buffered = io.BytesIO()
        pil_image.save(buffered, format="BMP")
        img_bytes = buffered.getvalue()

        # Encode the image in base64
        img_base64 = base64.b64encode(img_bytes).decode("utf-8")

        return {"decompressed_image": img_base64}
    except Exception as e:
        print(e)


def load_grayscale_raw(file_path, width, height):
    expected_size = width * height  # Expected number of bytes for the image

    # Read the raw data into a 1D array
    with open(file_path, "rb") as f:
        raw_data = np.fromfile(f, dtype=np.uint8)

    # If there are extra bytes, truncate the array to the expected size
    if raw_data.size > expected_size:
        raw_data = raw_data[:expected_size]
    elif raw_data.size < expected_size:
        raise ValueError(
            f"File size is smaller than expected for a {width}x{height} image."
        )

    # Reshape the data to 2D with the specified width and height
    image = raw_data.reshape((height, width))
    return image


# Specify file path and dimensions


# Display
if __name__ == "__main__":
    try:
        if sys.argv[1] == "compress":
            method = sys.argv[2]
            block_size = int(sys.argv[3])
            image_path = sys.argv[4]

            # Load the image as a numpy array
            image = img_toNparray(image_path)

            # Evaluate compression
            evaluation = compress_and_evaluate(image, method, block_size)
            evaluation_json = json.dumps(evaluation)

            sys.stdout.write(evaluation_json + "\n")
            sys.stdout.flush()
        elif sys.argv[1] == "decompress":
            compressed_file_path = sys.argv[2]

            result = decompress_file(compressed_file_path)

            print(json.dumps(result) + "\n")
        else:
            print("unknown command")
    except Exception as e:
        print(json.dumps({"error": e}))
        sys.exit(1)
