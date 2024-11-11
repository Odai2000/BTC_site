const express = require("express");
const cors = require("cors");
const { spawn } = require("child_process");
const formidable = require("formidable");
const fs = require("fs");
const path = require("path");
const app = express();
const port = 8080;


app.use(cors()); 
app.use("/temp", express.static(path.join(__dirname, "temp")));

app.post("/compress", (req, res) => {
  const form = new formidable.IncomingForm();

  form.parse(req, (err, fields, files) => {
    if (err) {
      return res.status(500).send("Error parsing form");
    }

    const uploadedFile = files.image[0]; 
  
    const method = fields.method
    const block_size = fields.block_size

    // Check if the uploaded file is valid
    if (!uploadedFile || !uploadedFile.filepath) {
      return res.status(400).send(`No image file uploaded: ${uploadedFile}`);
    }

    const pythonProcess = spawn(
      "python",
      ["./btc.py","compress", method, block_size, uploadedFile.filepath],
      {
        stdio: ["pipe", "pipe"], 
      }
    );

    let outputData = "";

    // Accumulate output from the Python script
    pythonProcess.stdout.on("data", (data) => {

      outputData += data.toString();
    });

    pythonProcess.on("close", (code) => {
      try {
        const evaluation = JSON.parse(outputData.trim());

        // Read the compressed file and stream it to the client
        const compressedFilePath = evaluation.compressed_file;
        const stream = fs.createReadStream(compressedFilePath);

        // Setting the headers
        res.set({
          "Content-Type": "application/octet-stream",
          "Content-Disposition": `attachment; filename="compressed_image.bin"`,
          "Access-Control-Expose-Headers": "Stats",
          Stats: JSON.stringify(evaluation),
        });

        stream.pipe(res);

        res.on('finish', () => {
          setTimeout(() => {
            fs.unlink(compressedFilePath, (err) => {
              if (err) {
                console.error(
                  `Error deleting file after 1 hour: ${compressedFilePath}`,
                  err
                );
              } else {
                console.log(
                  `File deleted successfully after 1 hour: ${compressedFilePath}`
                );
              }
            });
          }, 3600000); // 1 hour in milliseconds
        });
      } catch (parseError) {
        console.error("Error parsing Python output:", parseError);
        res.status(500).send(`Error parsing Python output: ${outputData}`);
      }
    });
  });
});
app.post("/decompress", (req, res) => {
  const form = new formidable.IncomingForm();

  form.parse(req, (err, fields, files) => {
    if (err) {
      return res.status(500).send("Error parsing form");
    }

    const compressedFile = files.compressed_file[0]; 


    // Pass the compressed file for decompression function in python
    const pythonProcess = spawn(
      "python",
      ["./btc.py", "decompress", compressedFile.filepath], 
      {
        stdio: ["pipe", "pipe", "ignore"]
      }
    );

    let outputData = "";

    pythonProcess.stdout.on("data", (data) => {
      outputData += data.toString();
    console.log("output: ",outputData);
    });

    pythonProcess.on("close", (code) => {
      try {
        
        const evaluation = JSON.parse(outputData.trim());

        res.json({
          decompressed_image: evaluation.decompressed_image, // Base64-encoded image
        });
      } catch (parseError) {
        
      console.log("output: ",outputData);
        console.log(parseError.message)
        res.status(500).send(`Error during decompression: ${parseError.message}`);
      }
    });
  });
});

// Start the Express server
app.listen(port, () => {
  console.log(`App is listening on port ${port}!`);
});
