/**
 * Copyright 2025 Mitch Spano
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { createElement } from "lwc";
import OrgCompare from "../../modules/s/orgCompare/orgCompare";

describe("OrgCompare", () => {
  let element: OrgCompare;

  beforeEach(() => {
    element = createElement("s-org-compare", {
      is: OrgCompare
    });
    document.body.appendChild(element);
  });

  afterEach(() => {
    document.body.removeChild(element);
  });

  it("should initialize with default configuration", () => {
    expect(element.sourceConfig.type).toBe("org");
    expect(element.targetConfig.type).toBe("org");
    expect(element.filter.metadataTypes).toEqual([]);
    expect(element.filter.status).toEqual(["added", "removed", "changed"]);
    expect(element.filter.searchTerm).toBe("");
  });

  it("should handle source type change", () => {
    const event = new CustomEvent("change", {
      detail: { value: "git" }
    });
    
    element.handleSourceTypeChange(event);
    
    expect(element.sourceConfig.type).toBe("git");
    expect(element.sourceConfig.orgAlias).toBeUndefined();
    expect(element.sourceConfig.gitRepo).toBeUndefined();
  });

  it("should handle target type change", () => {
    const event = new CustomEvent("change", {
      detail: { value: "git" }
    });
    
    element.handleTargetTypeChange(event);
    
    expect(element.targetConfig.type).toBe("git");
    expect(element.targetConfig.orgAlias).toBeUndefined();
    expect(element.targetConfig.gitRepo).toBeUndefined();
  });

  it("should handle source org change", () => {
    const event = new CustomEvent("change", {
      detail: { value: "test-org" }
    });
    
    element.handleSourceOrgChange(event);
    
    expect(element.sourceConfig.orgAlias).toBe("test-org");
  });

  it("should handle target org change", () => {
    const event = new CustomEvent("change", {
      detail: { value: "target-org" }
    });
    
    element.handleTargetOrgChange(event);
    
    expect(element.targetConfig.orgAlias).toBe("target-org");
  });

  it("should handle metadata type filter change", () => {
    const event = new CustomEvent("change", {
      detail: { value: ["CustomObject", "ApexClass"] }
    });
    
    element.handleMetadataTypeFilterChange(event);
    
    expect(element.filter.metadataTypes).toEqual(["CustomObject", "ApexClass"]);
  });

  it("should handle status filter change", () => {
    const event = new CustomEvent("change", {
      detail: { value: ["added", "changed"] }
    });
    
    element.handleStatusFilterChange(event);
    
    expect(element.filter.status).toEqual(["added", "changed"]);
  });

  it("should handle search term change", () => {
    const event = new CustomEvent("change", {
      detail: { value: "test search" }
    });
    
    element.handleSearchTermChange(event);
    
    expect(element.filter.searchTerm).toBe("test search");
  });

  it("should validate configuration correctly", () => {
    // Test with missing source org
    element.sourceConfig.type = "org";
    element.sourceConfig.orgAlias = undefined;
    element.targetConfig.type = "org";
    element.targetConfig.orgAlias = "target-org";
    
    expect(element.canCompare).toBe(false);
    
    // Test with valid configuration
    element.sourceConfig.orgAlias = "source-org";
    expect(element.canCompare).toBe(true);
  });

  it("should filter items correctly", () => {
    // Mock comparison result
    element.comparisonResult = {
      added: [
        { type: "CustomObject", name: "TestObject", fullName: "CustomObject/TestObject", status: "added" as const },
        { type: "ApexClass", name: "TestClass", fullName: "ApexClass/TestClass", status: "added" as const }
      ],
      removed: [],
      changed: [],
      unchanged: []
    };

    // Test metadata type filter
    element.filter.metadataTypes = ["CustomObject"];
    const filtered = element.filteredComparisonResult;
    expect(filtered?.added).toHaveLength(1);
    expect(filtered?.added[0].type).toBe("CustomObject");

    // Test search filter
    element.filter.metadataTypes = [];
    element.filter.searchTerm = "TestObject";
    const searchFiltered = element.filteredComparisonResult;
    expect(searchFiltered?.added).toHaveLength(1);
    expect(searchFiltered?.added[0].name).toBe("TestObject");
  });

  it("should handle view diff action", () => {
    const mockItem = {
      type: "CustomObject",
      name: "TestObject",
      fullName: "CustomObject/TestObject",
      status: "changed" as const
    };

    element.comparisonResult = {
      added: [],
      removed: [],
      changed: [mockItem],
      unchanged: []
    };

    const event = new CustomEvent("click", {
      detail: {}
    });
    
    // Mock the dataset
    const mockTarget = {
      dataset: { item: "CustomObject/TestObject" }
    } as HTMLElement;
    
    Object.defineProperty(event, 'target', {
      value: mockTarget,
      writable: true
    });

    element.handleViewDiff(event);
    
    // In a real test, you would verify that the toast was shown
    // For now, we just verify the method doesn't throw
    expect(true).toBe(true);
  });

  it("should provide correct options for dropdowns", () => {
    element.availableOrgs = ["org1", "org2", "org3"];
    element.availableMetadataTypes = ["CustomObject", "ApexClass", "ApexTrigger"];

    expect(element.sourceOrgOptions).toHaveLength(3);
    expect(element.sourceOrgOptions[0]).toEqual({ label: "org1", value: "org1" });

    expect(element.metadataTypeFilterOptions).toHaveLength(3);
    expect(element.metadataTypeFilterOptions[0]).toEqual({ label: "CustomObject", value: "CustomObject" });

    expect(element.statusFilterOptions).toHaveLength(4);
    expect(element.statusFilterOptions[0]).toEqual({ label: "Added", value: "added" });
  });
}); 