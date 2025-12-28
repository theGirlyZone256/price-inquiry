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
          createdAt: new Date().toISOString().split('T')[0]  // ⬅️ This gives only YYYY-MM-DD
        }
      }]);

      // 2. Create Products with ImgBB URLs
      const productRecords = imageUrls.map((url, i) => ({
        fields: {
          id: `${projectId}_item${i + 1}`,
          imageUrl: url,
          project: [projectRecord[0].getId()]
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

  // GET ALL PRODUCTS FOR A PROJECT
  if (req.method === 'GET' && req.query.project) {
    try {
      const projectId = req.query.project; // This is your custom ID like "proj_123456"
      
      // 1. First, find the project by your custom ID field
      const projectRecords = await base('projects').select({ 
        filterByFormula: `{id} = '${projectId}'` 
      }).firstPage();
      
      if (projectRecords.length === 0) {
        return res.status(404).json({ success: false, error: 'Project not found' });
      }
      
      const project = projectRecords[0].fields;
      const projectAirtableId = projectRecords[0].id; // Internal ID like "recABC123"
      
      console.log('Custom project ID:', projectId);
      console.log('Airtable internal project ID:', projectAirtableId);
      
      // 2. Find products linked to this project using the INTERNAL ID
      const productRecords = await base('products').select({ 
        filterByFormula: `{project} = '${projectAirtableId}'` 
      }).firstPage();
      
      console.log('Found products:', productRecords.length);
      
      const products = productRecords.map(record => ({
        id: record.fields.id,
        imageUrl: record.fields.imageUrl
      }));
      
      return res.json({ 
        success: true, 
        project: {
          id: project.id,
          name: project.name,
          status: project.status,
          createdAt: project.createdAt
        },
        products: products
      });
    } catch (error) {
      console.error('Error fetching project:', error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  // SUBMIT AN INQUIRY
  if (req.method === 'POST' && req.url === '/api/inquiries') {
    try {
      const { productId, price, colors, notes } = req.body;
      if (!productId || !price) {
        return res.status(400).json({ success: false, error: 'Product ID and Price are required' });
      }
      // Save to Airtable 'inquiries' table
      await base('inquiries').create([{ fields: { productId, price: Number(price), colors, notes } }]);
      
      return res.json({ success: true, message: 'Inquiry response submitted.' });
    } catch (error) {
      console.error('Error submitting inquiry:', error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  // If no route matches
  return res.status(404).json({ success: false, error: 'Route not found' });
}; 