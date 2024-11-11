document.addEventListener("DOMContentLoaded", () => {
  const imageOpts = document.querySelectorAll(".standard-imgs .img-option");
  const selectedImg = document.getElementById("selected-img");
  const uploadBtn = document.getElementById("upload-image-btn");
  const compressBtn = document.getElementById("compress-btn");
  const donwnloadDocsBtn = document.getElementById("download-docs-btn");
  const compareBtn = document.getElementById("compare-btn");
  const imageInput = document.getElementById("image-input");
  const fileInput = document.getElementById("file-input");
  const decompressBtn = document.getElementById("decompress-btn");
  const compressTab = document.getElementById("compress-tab-btn");
  const decompressTab = document.getElementById("decompress-tab-btn");

  const compressPanel = document.getElementById("compress-panel");
  const decompressPanel = document.getElementById("decompress-panel");

  let selectedImage = null;

  // Change selected image from standard options
  imageOpts.forEach((option) => {
    option.addEventListener("click", async () => {
      // Deselect other options
      imageOpts.forEach((opt) => opt.classList.remove("selected"));
      option.classList.add("selected");

      // Fetch image as a blob
      const imgSrc = option.querySelector("img").src;
      try {
        const response = await fetch(imgSrc);
        selectedImage = await response.blob();

        // Display the selected image
        const blobUrl = URL.createObjectURL(selectedImage);
        selectedImg.innerHTML = `<img src="${imgSrc}" alt="Selected Image" style="max-width: 100%;">`; //quick fix        URL.revokeObjectURL(blobUrl);
      } catch (error) {
        console.error("Failed to load image blob:", error);
      }
    });
  });

  //Handle image upload
  imageInput?.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (file) {
      selectedImage = file; // Store the file directly for upload
      const imgElement = document.createElement("img");
      imgElement.src = URL.createObjectURL(file); // Create a local URL for the selected file
      selectedImg.innerHTML = "";
      selectedImg.appendChild(imgElement);
      imageOpts.forEach((opt) => opt.classList.remove("selected"));
    }
  });
  //Handle file input; send decompress request
  fileInput?.addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (file) {
      const image = await decompress(file);
      const byteCharacters = atob(image);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: "image/bmp" }); // Adjust the MIME type as needed
      const downloadUrl = URL.createObjectURL(blob);
      handleDownload(downloadUrl, "decompressed_image.bmp");
    }
  });

  //compress button
  compressBtn?.addEventListener("click", async (event) => {
    event.preventDefault();

    const blockSize = document.querySelector('select[name="block-size"]').value;
    const method = document.querySelector('select[name="method"]').value;

    if (!selectedImage) {
      alert("Please select or upload an image first.");
      return;
    }

    compress(selectedImage, blockSize, [method]);
  });

  //compare button
  compareBtn?.addEventListener("click", async (event) => {
    const blockSize = document.querySelector('select[name="block-size"]').value;
    const methods = ["btc", "ambtc", "mmbtc"];
    if (!selectedImage) {
      alert("Please select or upload an image first.");
      return;
    }

    compress(selectedImage, blockSize, methods);
  });

  //change selected image from standard options
  imageOpts?.forEach((option) => {
    option.addEventListener("click", () => {
      selectedImage = option.querySelector("img").src; // Store the selected image URL
      selectedImg.innerHTML = `<img src="${selectedImage}" alt="Selected Image" style="max-width: 100%;">`;
      imageOpts.forEach((opt) => opt.classList.remove("selected"));
      option.classList.add("selected");
    });
  });

  //Ignore this, just auxiliary functions
  uploadBtn?.addEventListener("click", () => {
    imageInput.click();
  });
  decompressBtn?.addEventListener("click", () => {
    fileInput.click();
  });

  compressTab?.addEventListener("click", (e) => {
    openTab(e.currentTarget, compressPanel);
  });
  decompressTab?.addEventListener("click", (e) => {
    openTab(e.currentTarget, decompressPanel);
  });
});

//components
function NavBar() {
  const element = document.createElement("nav");
  element.className = "nav-bar";
  element.id = "nav";

  element.innerHTML = `
    <div class="logo">
    <a href="/">
      <img src="./res/logo.svg" alt="Logo" /></a>
    </div>
    <div class="nav-elements">
    <div class="nav-element"><a href="./service.html">Service</a></div>
    <div class="nav-element"><a href="./how-it-works.html">How it works</a></div>
    <div class="nav-element"><a href="./about-us.html">About us</a></div></div>
<button id="download-docs-btn" class="btn"><a href="./res/docs.pdf">Download Docs</a></button>
<button id="b-menu"><i class="fa-solid fa-bars"></i></button>
  `;

  this.render = function (parent) {
    parent.insertBefore(element, parent.firstChild);
  };
}

async function compress(image, blockSize, methods) {
  const table = document.getElementById("result-data-table");
  const downloadBtnGroup = document.getElementById("download-btns");
  const resultImgs = document.getElementById("result-imgs");
  const loadElement = document.getElementById("loading");

  document.getElementById("result-panel").style.display = "flex";

  // Return html elements to initial state
  table.innerHTML = `<thead class="table-head">
                  <th>Technique</th>
                  <th>CR</th>
  
                  <th>SSIM</th>
  
                  <th>PSNR</th>
  
                  <th>Compress Exec. Time</th>
                  <th>Decompress Exec. Time</th>
                </thead>`;

  resultImgs.innerHTML = "";
  downloadBtnGroup.innerHTML = "";

  loadElement.style.display = "flex"; // Show loading element

  // Create an array of promises
  const compressionPromises = methods.map(async (method) => {
    const formData = new FormData();
    formData.append("block_size", blockSize);
    formData.append("method", method);
    formData.append("image", image);

    try {
      const response = await fetch("http://localhost:8080/compress", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`Server error: ${response.statusText}`);
      }

      // Load stats
      const statsHeader = response.headers.get("Stats");
      let compression_ratio,
        ssim,
        psnr,
        compress_execution_time,
        decompress_execution_time;

      if (statsHeader) {
        const Stats = JSON.parse(statsHeader);
        ({
          compression_ratio,
          ssim,
          psnr,
          compress_execution_time,
          decompress_execution_time,
        } = Stats);
      }

      // Load compressed file from response and create download URL for it
      const blob = await response.blob();
      const downloadUrl = URL.createObjectURL(blob);

      // Insert data into the table
      table.style.display = "table";
      table.insertAdjacentHTML(
        "beforeend",
        `
       <tr>
          <td>${method}</td>
          <td id="${method}-cr-value">${compression_ratio}:1</td>
          <td id="${method}-ssim-value">${ssim}</td>
          <td id="${method}-psnr-value">${psnr}</td>
          <td id="${method}-compress_exec-time-value">${compress_execution_time}</td>
          <td id="${method}-decompress_exec-time-value">${decompress_execution_time}</td>
        </tr>
      `
      );

      // Create download button
      const downloadBtn = document.createElement("button");
      downloadBtn.innerHTML = `Download ${method} file`;
      downloadBtn.classList.add("btn", "download-btn");
      downloadBtn.id = `${method}-download-btn`;
      downloadBtn.onclick = () => {
        handleDownload(downloadUrl, `${method}-file.btc`);
      };

      downloadBtnGroup.append(downloadBtn);

      // Display decompressed image
      const decompressedImage = await decompress(blob);
      if (decompressedImage) {
        const imgElement = document.createElement("img");
        imgElement.src = `data:image/bmp;base64,${decompressedImage}`;
        imgElement.alt = `Decompressed Image ${method}`;

        const headingElement = document.createElement("h4");
        headingElement.innerHTML = `${method.toUpperCase()}`;

        const imgBox = document.createElement("div");
        const containerElement = document.createElement("div");
        imgBox.classList.add("img-box");
        imgBox.classList.add("box-shadow");
        imgBox.appendChild(imgElement);

        containerElement.classList.add("container");
        containerElement.appendChild(imgBox);
        containerElement.appendChild(headingElement);

        resultImgs.appendChild(containerElement);
      }
    } catch (error) {
      console.error("Error:", error);
    }
  });

  // Wait for all promises to resolve or any to reject
  await Promise.all(compressionPromises).finally(() => {
    loadElement.style.display = "none"; // Hide loading element
  });
}
async function decompress(compressedFile) {
  const formData = new FormData();
  formData.append("compressed_file", compressedFile);

  //send compressed file for decompression
  try {
    const response = await fetch("http://localhost:8080/decompress", {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`Decompression failed: ${response.statusText}`);
    }

    const result = await response.json();
    const decompressedImage = result.decompressed_image;

    return decompressedImage;
  } catch (error) {
    console.error("Error:", error);
    return null;
  }
}
//handle file download
function handleDownload(blobUrl, name) {
  const link = document.createElement("a");
  link.href = blobUrl;
  link.download = name;
  document.body.appendChild(link);
  link.click();
}

//tabs for services
function openTab(tab, panel) {
  if (!tab.classList.contains("active")) {
    const tabs = document.getElementsByClassName("tab");
    Array.from(tabs).forEach((opt) => opt.classList.remove("active"));
    tab.classList.add("active");

    const panels = document.getElementsByClassName("tab-panel");
    Array.from(panels).forEach((opt) => opt.classList.remove("active"));
    panel.classList.add("active");
  }
}
