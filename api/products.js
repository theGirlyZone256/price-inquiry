const Airtable = require('airtable');

const base = new Airtable({
  apiKey: process.env.AIRTABLE_API_KEY
}).base(process.env.AIRTABLE_BASE_ID);

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // CREATE PROJECT (now receives ImgBB URLs, not Base64)
  if (req.method === 'POST' && req.url === '/api/products') {
    try {
      const { imageUrls, projectName } = req.body; // imageUrls are now ImgBB URLs
      
      if (!imageUrls || !Array.isArray(imageUrls)) {
        return res.status(400).json({ success: false, error: 'Image URLs array required' });
      }

      // 1. Create Project
      const projectId = 'proj_' + Math.floor(100000 + Math.random() * 900000);
      const projectRecord = await base('projects').create([{
        fields: {
          id: projectId,
          name: projectName || `Project ${new Date().toLocaleDateString()}`,
          Status: 'Todo',
          createdAt: new Date().toISOString()
        }
      }]);

      // 2. Create Products with ImgBB URLs
      const productRecords = imageUrls.map((url, i) => ({
        fields: {
          id: `${projectId}_item${i + 1}`,
          imageUrl: url,
          project: [projectRecord[0].id]
        }
      }));
      
      await base('products').create(productRecords);
      
      return res.json({ 
        success: true, 
        projectId: projectId,
        productCount: imageUrls.length,
        inquiryUrl: `${req.headers.origin || 'https://YOUR-FRONTEND.netlify.app'}/app.html?project=${projectId}`,
        message: `Project created with ${imageUrls.length} product(s).`
      });
    } catch (error) {
      console.error('Error:', error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  // KEEP THE OTHER ROUTES (GET PROJECT, SUBMIT INQUIRY) EXACTLY AS THEY WERE
  if (req.method === 'GET' && req.query.project) {
    try {
      const projectId = req.query.project;
      const projectRecords = await base('projects').select({ filterByFormula: `{id} = '${projectId}'` }).firstPage();
      if (projectRecords.length === 0) return res.status(404).json({ success: false, error: 'Project not found' });
      
      const productRecords = await base('products').select({ 
        filterByFormula: `{project} = '${projectRecords[0].id}'` 
      }).firstPage();
      
      return res.json({ 
        success: true, 
        project: projectRecords[0].fields,
        products: productRecords.map(p => p.fields)
      });
    } catch (error) {
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  if (req.method === 'POST' && req.url === '/api/inquiries') {
    try {
      const { productId, price, colors, notes } = req.body;
      await base('inquiries').create([{ fields: { productId, price: Number(price), colors, notes } }]);
      return res.json({ success: true, message: 'Inquiry submitted.' });
    } catch (error) {
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  return res.status(404).json({ success: false, error: 'Route not found' });
};