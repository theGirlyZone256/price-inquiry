const Airtable = require('airtable');

const base = new Airtable({
  apiKey: process.env.AIRTABLE_API_KEY
}).base(process.env.AIRTABLE_BASE_ID);

module.exports = async (req, res) => {
  // === CORS HEADERS ===
  res.setHeader('Access-Control-Allow-Origin', 'https://priceinquiry.netlify.app');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  // === HANDLE OPTIONS ===
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  // CREATE PROJECT
  if (req.method === 'POST' && req.url === '/api/products') {
    try {
      const { imageUrls, projectName } = req.body;
      
      if (!imageUrls || !Array.isArray(imageUrls)) {
        return res.status(400).json({ 
          success: false, 
          error: 'Image URLs array required' 
        });
      }
      
      const projectId = 'proj_' + Math.floor(100000 + Math.random() * 900000);
      
      // Create project
      const projectRecord = await base('projects').create([{
        fields: {
          id: projectId,
          name: projectName || `Project ${new Date().toLocaleDateString()}`,
          Status: 'Todo',
          createdAt: new Date().toISOString().split('T')[0]
        }
      }]);
      
      const projectAirtableId = projectRecord[0].id;
      
      // Create products
      const productRecords = imageUrls.map((url, i) => ({
        fields: {
          id: `${projectId}_item${i + 1}`,
          imageUrl: url,
          project: [projectAirtableId]
        }
      }));
      
      await base('products').create(productRecords);
      
      return res.json({ 
        success: true, 
        projectId: projectId,
        productCount: imageUrls.length,
        inquiryUrl: `https://priceinquiry.netlify.app/?project=${projectId}`,
        message: `Project created with ${imageUrls.length} product(s).`
      });
      
    } catch (error) {
      console.error('Error:', error);
      return res.status(500).json({ 
        success: false, 
        error: error.message 
      });
    }
  }
  
  // GET PROJECT WITH PRODUCTS - USING MANUAL FILTERING
  if (req.method === 'GET' && req.query.project) {
    try {
      const projectId = req.query.project;
      
      // 1. Find the project
      const projectRecords = await base('projects').select({
        filterByFormula: `{id} = '${projectId}'`
      }).firstPage();
      
      if (projectRecords.length === 0) {
        return res.status(404).json({ 
          success: false, 
          error: 'Project not found' 
        });
      }
      
      const project = projectRecords[0].fields;
      const projectAirtableId = projectRecords[0].id;
      
      // 2. GET ALL PRODUCTS and filter MANUALLY
      const allProducts = await base('products').select().all();
      
      // 3. Filter products where project array contains our projectAirtableId
      const linkedProducts = [];
      allProducts.forEach(record => {
        if (record.fields.project && 
            Array.isArray(record.fields.project) && 
            record.fields.project.includes(projectAirtableId)) {
          linkedProducts.push({
            id: record.fields.id,
            imageUrl: record.fields.imageUrl
          });
        }
      });
      
      // Sort by creation order (item1, item2, etc.)
      linkedProducts.sort((a, b) => {
        const aNum = parseInt(a.id.split('_item')[1]) || 0;
        const bNum = parseInt(b.id.split('_item')[1]) || 0;
        return aNum - bNum;
      });
      
      return res.json({
        success: true,
        project: {
          id: project.id,
          name: project.name,
          status: project.Status || 'Todo',
          createdAt: project.createdAt
        },
        products: linkedProducts
      });
      
    } catch (error) {
      console.error('Error:', error);
      return res.status(500).json({ 
        success: false, 
        error: error.message 
      });
    }
  }
  
  // SUBMIT INQUIRY - SIMPLE VERSION
  if (req.method === 'POST' && req.url === '/api/inquiries') {
    try {
      const { productId, price, colors, notes } = req.body;
      
      if (!productId || !price) {
        return res.status(400).json({ 
          success: false, 
          error: 'Product ID and Price are required' 
        });
      }
      
      // Convert price to number
      const priceNum = Number(price);
      if (isNaN(priceNum) || priceNum <= 0) {
        return res.status(400).json({ 
          success: false, 
          error: 'Price must be a positive number' 
        });
      }
      
      // Create the inquiry record
      await base('inquiries').create([{ 
        fields: { 
          productId, 
          price: priceNum,
          colors: colors || '', 
          notes: notes || '',
          submittedAt: new Date().toISOString()
        } 
      }]);
      
      return res.json({ 
        success: true, 
        message: 'Inquiry response submitted successfully.'
      });
      
    } catch (error) {
      console.error('Error submitting inquiry:', error);
      return res.status(500).json({ 
        success: false, 
        error: error.message 
      });
    }
  }
  
  // Default 404
  return res.status(404).json({ 
    success: false, 
    error: 'Route not found' 
  });
};