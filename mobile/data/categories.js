export const categories = [

    {
        id: 1,
        category_name: "All"
        
    },
    {
        id: 2,
        category_name: "Tops",
        
    },
    {
        id: 3,
        category_name: "Cat 3",
    }

]


export const variants = [

    {
        id: 1,
        category_name: "Slim",
    },
    {
        id: 2,
        category_name: "Regular",
    },
    {
        id: 3,
        category_name: "Oversized",
    }

]

export const subCategories = {
  1: [ // Sub-categories for "All" (ID: 1)
    { id: 101, name: "New Arrivals" },
    { id: 102, name: "Trending" }
  ],
  2: [ // Sub-categories for "Tops" (ID: 2)
    { id: 201, name: "T-Shirts" },
    { id: 202, name: "Shirts" },
    { id: 203, name: "Hoodies" }
  ],
  3: [ // Sub-categories for "Bottoms" (ID: 3)
    { id: 301, name: "Jeans" },
    { id: 302, name: "Shorts" },
    { id: 303, name: "Pants" }
  ]
};

export const size = [
    {
        id:1,
        size_name: "All",
        size_attribute: "All"
    },
    {
        id:2,
        size_name: "Small",
        size_attribute: "S",
    },{
        id:3,
        size_name: "Medium",
        size_attribute: "M",
    },
    {
        id:4,
        size_name: "Large",
        size_attribute: "L",
    },
    {
        id:5,
        size_name: "Extra-Large",
        size_attribute: "XL",
    },
]

export const fit = [

    {
        id:1,
        fit_name: "Regular",
        
      
    },{
        id:2,
        fit_name: "Slim",
      
    },
    {
        id:3,
        fit_name: "Oversized",
        
    }
    
]

export const sort = [

    {
        id:1,
        sort_name: "Newest",
      
    },{
        id:2,
        sort_name: "Low Price",
      
    },
    {
        id:3,
        sort_name: "High Price",
        
    }
    
]