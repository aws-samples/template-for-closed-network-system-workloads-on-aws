
package com.example.sampleapp.webapp.controller;

import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.ui.Model;
import org.springframework.validation.BindingResult;
import org.springframework.validation.annotation.Validated;
import com.example.sampleapp.webapp.domain.dto.SampleAppListDto;
import com.example.sampleapp.webapp.domain.SampleAppService;

@Controller
public class SampleAppController {
	private final SampleAppService service;
	public SampleAppService sampleAppService;

	public SampleAppController(SampleAppService service) {
		this.service = service;
	}

	@RequestMapping(value = { "/sampleapp/list", "/" })
	@GetMapping
	public String sampleAppList(Model model) {

		SampleAppListDto sampleAppList = service.listAll();
		model.addAttribute("sampleapplist", sampleAppList);
		return "sampleapplist";
	}

	@RequestMapping("/sampleapp/form")
	@GetMapping
	public String sampleAppForm(Model model) {

		SampleAppListDto sampleAppList = service.listAll();
		model.addAttribute("sampleapplist", sampleAppList);
		return "sampleappform";
	}

	@RequestMapping("/sampleapp/form/update")
	@PostMapping
	public String sampleAppListUpdate(@Validated @ModelAttribute SampleAppListDto sampleappformlist,
			BindingResult result, Model model) {

		service.updateAll(sampleappformlist);
		model.addAttribute("sampleapplist", service.listAll());
		return "forward:/";
	}

}
